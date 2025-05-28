# ReveNew API

A Node.js API for tracking and managing in-app purchases with MongoDB and Firebase integration.

## Configuration

1. Copy the configuration example file:
```bash
cp config.example.js config.js
```

2. Edit `config.js` and update the following configurations:

### MongoDB Configuration
- Update the MongoDB URI with your database credentials:
  ```javascript
  mongodb: {
    uri: "mongodb+srv://your_username:your_password@your_cluster.mongodb.net/your_database?retryWrites=true&w=majority"
  }
  ```

### Firebase Configuration
- Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
- Generate a new private key for your service account
- <img width="1435" alt="Screenshot 2025-05-25 at 16 32 59" src="https://github.com/user-attachments/assets/13d342ce-fab2-41fd-b9d7-c05387fb4c24" />
- Update the Firebase configuration in `config.js` with your service account details:
  ```javascript
  firebase: {
    project_id: "your-project-id",
    private_key_id: "your-private-key-id",
    private_key: "your-private-key",
    client_email: "your-client@your-project.iam.gserviceaccount.com",
    // ... other Firebase configuration
  }
  ```
- (Optional) If you want to receive Push Notifications for each transactions inside your ReveNew app you have to setup Apple Push Notifications in the Cloud Messaging section of Firebase
- <img width="1445" alt="Firebase_Messagging" src="https://github.com/user-attachments/assets/fa41140d-6c1f-4bb9-88bc-d2f41c9d4062" />
- You can follow any online tutorial on "How to generate Apple Push Certificate"


### Server Configuration
- Update the server port if needed (default is 3032):
  ```javascript
  server: {
    port: 3032
  }
  ```

## Running with Docker

1. Build the Docker image:
```bash
docker build -t revenew-api .
```

2. Run the container:
```bash
docker run -p 3032:3032 revenew-api
```

## Running Locally

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
node index.js
```

## API Endpoints

- POST `/api/v1/create-user` - Create a new user
- PUT `/api/v1/update-token` - Update user token
- POST `/api/v1/log-purchase` - Log a purchase and send notifications
- GET `/api/v1/purchases` - Retrieve purchases with optional filters
- GET `/api/v1/apps` - Get list of unique app names
- GET `/api/v1/purchases/summary` - Get purchases summary with grouping options
- ### Download Tracking
- POST `/api/v1/log-download` - Log a unique download for a user
  ```json
  {
    "userId": "user123",
    "appName": "MyApp"
  }
  ```
  Response includes timestamp of the download:
  ```json
  {
    "success": true,
    "message": "Download logged successfully",
    "data": {
      "userId": "user123",
      "appName": "MyApp",
      "timestamp": "2024-03-21T14:32:45.123Z"
    }
  }
  ```
  Note: Each user can only have one download record per app. Subsequent download attempts will return a success message indicating the download was already logged.

- GET `/api/v1/downloads` - Get download statistics with filtering options
  - Query Parameters:
    - `appName` (optional) - Filter by app name
    - `startDate` (optional) - Start date for the range (YYYY-MM-DD)
    - `endDate` (optional) - End date for the range (YYYY-MM-DD)
    - `groupBy` (optional) - Group results by: 'hour', 'day', 'week', 'month', or 'total' (default: 'day')
    - `includeDetails` (optional) - Include detailed download records with timestamps (default: false)

## Security Notes

- Never commit your `config.js` file to version control
- Keep your Firebase private key and MongoDB credentials secure
- Consider using environment variables for production deployments 
