# ReveNew API

A Node.js API for tracking and managing in-app purchases with MongoDB and Firebase integration.

## Configuration

1. Copy the configuration example file:
```bash
cp config.example.js config.js
```

2. Edit `config.js` and update the following configurations:

### MongoDB Configuration
- Create a MongoDB account
- Create a new cluster
  - Choose the Free Tier (M0) for a free shared cluster (sufficient for 90% of the cases)
- In the left sidebar, click Database Access.
  - Click Add New Database User.
  - Enter a username and password — this will be used in your URI.
  - Set user privileges (default is “Read and write to any database”).
  - Save the user.
- In the left sidebar, click Network Access.
  - Click Add IP Address.
  - You can add your current IP by clicking Add Current IP Address or add 0.0.0.0/0 to allow access from anywhere (less secure).
  - Save the changes.
- Go back to the Clusters page.
  - Click Connect on your cluster.
  - Select Connect your application.
  - Copy the connection string provided. 
- Update the MongoDB URI with your database connecting string that looks like:
  ```javascript
  mongodb: {
    uri: "mongodb+srv://your_username:your_password@your_cluster.mongodb.net/your_database?retryWrites=true&w=majority"
  }
  ```

### Firebase Configuration
- Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
- Generate a new private key for your service account
- <img width="1435" alt="Screenshot 2025-05-25 at 16 32 59" src="https://github.com/user-attachments/assets/311135c5-b8f9-42aa-a6fe-be6460477af7" />
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
- <img width="1445" alt="Firebase_Messagging" src="https://github.com/user-attachments/assets/a6dc3aaf-407f-45dd-806e-ad4519e7451f" />
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
