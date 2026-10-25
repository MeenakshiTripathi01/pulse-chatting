import mongoose from 'mongoose';

// Strips MongoDB query operators (e.g. {"$gt": ""}) from user-supplied filter values,
// a second line of defence against NoSQL injection on top of request validation.
mongoose.set('sanitizeFilter', true);

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
    console.warn('[db] MongoDB disconnected; the driver will try to reconnect.');
  });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
