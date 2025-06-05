const mongoose = require('mongoose');
const express = require('express');
const mongodb = require('mongodb');
const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Load configuration
let config;
try {
  config = require('./config.js');
} catch (err) {
  console.error('Error loading config.js. Please copy config.example.js to config.js and update with your values.');
  process.exit(1);
}

// MongoDB URI and Client
mongoose.connect(config.mongodb.uri, { useNewUrlParser: true, useUnifiedTopology: true });

// Firebase Admin SDK config
admin.initializeApp({
  credential: admin.credential.cert(config.firebase),
});

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  userToken: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const purchaseSchema = new mongoose.Schema({
  currencyCode: { type: String, required: true },
  price: { type: Number, required: true },
  priceFormatted: { type: String },
  kind: { type: String, required: true },
  isSandbox: { type: Boolean, required: true },
  appName: { type: String, required: true },
  storeFront: { type: String },
  isTrial: { type: Boolean, default: false },
  trialPeriod: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// New Download Schema
const downloadSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  appName: { type: String, required: true },
  timestamp: { type: Date, required: true }, // Exact time of download
  createdAt: { type: Date, default: Date.now }
});

// Create a compound unique index to prevent duplicate downloads for the same user and app
downloadSchema.index({ userId: 1, appName: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Purchase = mongoose.model('Purchase', purchaseSchema);
const Download = mongoose.model('Download', downloadSchema);

  // Create User
  app.post('/api/v1/create-user', async (req, res) => {
    const { userId, email, userToken } = req.body;
    if (!userId || !email || !userToken) {
      return res.status(400).json({ success: false, message: 'Missing userId, email, or userToken' });
    }

    const user = { userId, email, userToken, createdAt: new Date() };
    try {
      await User.create(user);
      res.json({ success: true, message: 'User created', data: user });
    } catch (err) {
      res.status(500).json({ success: false, message: 'DB error', error: err });
    }
  });

  // Update Token
  app.put('/api/v1/update-token', async (req, res) => {
    const { userId, userToken } = req.body;
    if (!userId || !userToken) {
      return res.status(400).json({ success: false, message: 'Missing userId or userToken' });
    }

    try {
      await User.updateOne({ userId }, { $set: { userToken } });
      res.json({ success: true, message: 'Token updated' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'DB error', error: err });
    }
  });

  // Log Purchase and Send Push to all users with userToken
  app.post('/api/v1/log-purchase', async (req, res) => {
    const { currencyCode, price, priceFormatted, kind, isSandbox, appName, storeFront, isTrial, trialPeriod } = req.body;
    if (!currencyCode || price == null || !kind || isSandbox == null || !appName) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    const purchase = { 
      currencyCode, 
      price, 
      priceFormatted, 
      kind, 
      isSandbox, 
      appName, 
      storeFront, 
      isTrial: isTrial || false,
      trialPeriod,
      createdAt: new Date() 
    };

    try {
      await Purchase.create(purchase);

      const users = await User.find({ userToken: { $exists: true, $ne: null } });
      const notifications = users.map(user => ({
        token: user.userToken,
        notification: {
          title: `New ${isTrial ? 'Trial' : 'Purchase'} - ${appName}`,
          body: isTrial 
            ? `Started ${trialPeriod || ''} trial for ${kind}`
            : `Purchased ${kind} for ${priceFormatted}`
        },
        apns: {
          payload: {
            aps: {
              sound: 'purchase.wav'
            }
          }
        }
      }));

      for (const msg of notifications) {
        try {
          await admin.messaging().send(msg);
        } catch (pushErr) {
          console.warn('Push notification failed for token:', msg.token, pushErr.message);
        }
      }

      res.json({ success: true, message: 'Purchase logged and notifications sent', data: purchase });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error processing request', error: err });
    }
  });

  // Retrieve Purchases + Total in USD
  app.get('/api/v1/purchases', async (req, res) => {
    const { 
      appName, 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      includeSandbox = 'true',
      includeTrials = 'true',
      trialStatus
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
  
    const query = {};
    if (appName) query.appName = appName;
    if (includeSandbox === 'false') query.isSandbox = false;
    
    // Handle trial filtering
    if (includeTrials === 'false') {
      query.isTrial = false;
    } else if (trialStatus === 'trials-only') {
      query.isTrial = true;
    } else if (trialStatus === 'paid-only') {
      query.isTrial = false;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
  
    try {
      const [paginated, all] = await Promise.all([
        Purchase.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
        Purchase.find(query).sort({ createdAt: -1 })
      ]);
  
      // Fetch conversion rates to EUR from CDN
      let conversionRates;
      try {
        const today = new Date().toISOString().split('T')[0]; // e.g., "2025-05-04"
        const rateResp = await axios.get(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${today}/v1/currencies/eur.json`);
        conversionRates = rateResp.data.eur;
      } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to fetch currency rates', error: err.message });
      }
  
      // Convert to USD
      const conversions = all.map((p) => {
        // Don't count trial transactions in the total USD
        if (p.isTrial) return 0;
        
        if (!p.currencyCode || isNaN(p.price)) return 0;
        const currencyKey = p.currencyCode.toLowerCase();
        const rateToEUR = 1 / (conversionRates[currencyKey] || 0);
        const usdPerEur = conversionRates['usd'];
        if (!rateToEUR || !usdPerEur) return 0;
        const amountInEUR = p.price * rateToEUR;
        const amountInUSD = amountInEUR * usdPerEur;
        return amountInUSD;
      });
  
      const totalUSD = conversions.reduce((sum, val) => sum + val, 0);
      
      // Get trial statistics
      const trialCount = all.filter(p => p.isTrial).length;
      const paidCount = all.filter(p => !p.isTrial).length;
  
      res.json({
        success: true,
        purchases: paginated,
        totalInUSD: totalUSD.toFixed(2),
        stats: {
          total: all.length,
          trials: trialCount,
          paid: paidCount
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching data', error: err });
    }
  });

// Get list of unique app names from purchases
app.get('/api/v1/apps', async (req, res) => {
  try {
    const apps = await Purchase.distinct('appName');
    res.json({ success: true, apps });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching app list', error: err });
  }
});

// Purchases summary endpoint: grouped earnings
app.get('/api/v1/purchases/summary', async (req, res) => {
  const { appName, startDate, endDate, includeSandbox = 'true', groupBy } = req.query;

  const match = {};
  if (appName) match.appName = appName;
  if (includeSandbox === 'false') match.isSandbox = false;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  end.setUTCHours(23, 59, 59, 999);
  match.createdAt = { $gte: start, $lte: end };

  const actualGroupBy = groupBy || 'day';
  let dateFormat;
  if (actualGroupBy === 'hour') dateFormat = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } };
  else if (actualGroupBy === 'day') dateFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
  else if (actualGroupBy === 'week') dateFormat = { $dateToString: { format: '%G-%V', date: '$createdAt' } };
  else if (actualGroupBy === 'month') dateFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };

  try {
    const grouped = await Purchase.aggregate([
      { $match: match },
      { $group: {
        _id: dateFormat,
        purchases: { $push: '$$ROOT' },
        totalPrice: { $sum: '$price' },
        trialCount: { $sum: { $cond: [{ $eq: ['$isTrial', true] }, 1, 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$isTrial', false] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    const today = new Date().toISOString().split('T')[0];
    const rateResp = await axios.get(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${today}/v1/currencies/eur.json`);
    const conversionRates = rateResp.data.eur;

    const result = grouped.map(group => {
      const groupTotalUSD = group.purchases.reduce((sum, p) => {
        // Don't count trial transactions in the total USD
        if (p.isTrial) return sum;
        
        const currencyKey = p.currencyCode?.toLowerCase();
        const rateToEUR = 1 / (conversionRates[currencyKey] || 0);
        const usdPerEur = conversionRates['usd'];
        if (!rateToEUR || !usdPerEur) return sum;
        const amountInEUR = p.price * rateToEUR;
        return sum + amountInEUR * usdPerEur;
      }, 0);
      const formattedDate = new Date(group._id).toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm
      return {
        group: formattedDate,
        totalInUSD: parseFloat(groupTotalUSD.toFixed(2)),
        count: group.purchases.length,
        trialCount: group.trialCount,
        paidCount: group.paidCount
      };
    });

    res.json({ success: true, grouped: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error processing summary', error: err.message });
  }
});

// Log Download
app.post('/api/v1/log-download', async (req, res) => {
  const { userId, appName } = req.body;
  
  if (!userId || !appName) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing userId or appName' 
    });
  }

  try {
    const download = {
      userId,
      appName,
      timestamp: new Date()
    };

    await Download.create(download);
    res.json({ 
      success: true, 
      message: 'Download logged successfully',
      data: {
        userId,
        appName,
        timestamp: download.timestamp
      }
    });
  } catch (err) {
    // If error is due to duplicate key, return success with a different message
    if (err.code === 11000) {
      return res.json({ 
        success: true, 
        message: 'Download already logged for this user and app' 
      });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Error logging download', 
      error: err.message 
    });
  }
});

// Get Downloads Statistics
app.get('/api/v1/downloads', async (req, res) => {
  const { appName, startDate, endDate, groupBy = 'day', includeDetails = 'false' } = req.query;

  try {
    const match = {};
    if (appName) match.appName = appName;

    // Set date range
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    match.timestamp = { $gte: start, $lte: end };

    // Define group format based on groupBy parameter
    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } };
        break;
      case 'week':
        dateFormat = { $dateToString: { format: '%G-W%V', date: '$timestamp' } };
        break;
      case 'month':
        dateFormat = { $dateToString: { format: '%Y-%m', date: '$timestamp' } };
        break;
      case 'total':
        dateFormat = 'total';
        break;
      default: // day
        dateFormat = { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: groupBy === 'total' ? 'total' : dateFormat,
          uniqueUsers: { $addToSet: '$userId' },
          count: { $sum: 1 },
          downloads: {
            $push: includeDetails === 'true' ? {
              userId: '$userId',
              timestamp: '$timestamp',
              appName: '$appName'
            } : '$$REMOVE'
          }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          uniqueUsers: { $size: '$uniqueUsers' },
          totalDownloads: '$count',
          details: includeDetails === 'true' ? '$downloads' : '$$REMOVE'
        }
      },
      { $sort: { period: 1 } }
    ];

    const downloads = await Download.aggregate(pipeline);

    // Calculate total unique users across all periods
    const totalUnique = await Download.distinct('userId', match);

    res.json({
      success: true,
      data: {
        downloads,
        totalUniqueUsers: totalUnique.length,
        periodType: groupBy,
        startDate: start,
        endDate: end
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching download statistics', 
      error: err.message 
    });
  }
});

// Get trial conversion statistics
app.get('/api/v1/trials/stats', async (req, res) => {
  const { appName, startDate, endDate } = req.query;

  try {
    const match = {};
    if (appName) match.appName = appName;

    // Set date range
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    // Get all purchases within the time period
    const purchases = await Purchase.find(match).sort({ createdAt: 1 });

    // Group purchases by app name
    const appStats = {};
    purchases.forEach(purchase => {
      if (!appStats[purchase.appName]) {
        appStats[purchase.appName] = {
          totalPurchases: 0,
          trials: 0,
          conversions: 0,
          conversionRate: 0,
          revenue: 0
        };
      }

      const stats = appStats[purchase.appName];
      stats.totalPurchases++;

      if (purchase.isTrial) {
        stats.trials++;
      } else {
        stats.conversions++;
        
        // Add to revenue (only count non-trial purchases)
        if (!isNaN(purchase.price)) {
          stats.revenue += purchase.price;
        }
      }
    });

    // Calculate conversion rates
    Object.keys(appStats).forEach(app => {
      const stats = appStats[app];
      stats.conversionRate = stats.trials > 0 
        ? parseFloat((stats.conversions / stats.trials * 100).toFixed(2)) 
        : 0;
    });

    // Overall stats
    const totalTrials = purchases.filter(p => p.isTrial).length;
    const totalPaid = purchases.filter(p => !p.isTrial).length;
    const overallConversionRate = totalTrials > 0 
      ? parseFloat((totalPaid / totalTrials * 100).toFixed(2)) 
      : 0;

    res.json({
      success: true,
      data: {
        byApp: appStats,
        overall: {
          totalPurchases: purchases.length,
          trials: totalTrials,
          conversions: totalPaid,
          conversionRate: overallConversionRate
        }
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching trial statistics', 
      error: err.message 
    });
  }
});

const PORT = config.server.port;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));