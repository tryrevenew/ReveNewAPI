// Rename this file to config.js and update with your configuration values
module.exports = {
  // MongoDB Configuration
  mongodb: {
    uri: "mongodb+srv://your_username:your_password@your_cluster.mongodb.net/your_database?retryWrites=true&w=majority"
  },

  // Firebase Admin Configuration
  firebase: {
    type: "service_account",
    project_id: "your-project-id",
    private_key_id: "your-private-key-id",
    private_key: "-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----",
    client_email: "your-client@your-project.iam.gserviceaccount.com",
    client_id: "your-client-id",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/your-cert-url",
    universe_domain: "googleapis.com"
  },

  // Server Configuration
  server: {
    port: 3032
  }
}; 