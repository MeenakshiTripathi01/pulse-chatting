import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  } catch (error) {
    throw new Error(
      `Could not connect to MongoDB (${error.message}). ` +
        'Check MONGODB_URI, your network connection, and (for Atlas) the IP access list.',
    );
  }

  mongoose.connection.on('error', (error) => {
    console.error('[db] MongoDB connection error:', error.message);
  });
  mongoose.connection.on('disconnected', () => {
    if (!closingIntentionally) {
      console.warn('[db] MongoDB disconnected; the driver will try to reconnect.');
    }
  });
}

let closingIntentionally = false;

export async function disconnectDatabase() {
  closingIntentionally = true;
  await mongoose.disconnect();
}
