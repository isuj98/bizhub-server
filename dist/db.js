import mongoose from 'mongoose';
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.warn('MONGO_URI is not set. Database features (auth, businesses, zaps, hubs) will not work. Set MONGO_URI in .env to enable.');
}
export async function connectDb() {
    if (!MONGO_URI)
        return;
    try {
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB connected');
    }
    catch (err) {
        console.error('MongoDB connection error:', err);
        throw err;
    }
}
export function isDbConnected() {
    return mongoose.connection.readyState === 1;
}
