import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { Resend } from 'resend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Resend with API Key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_key');

// Configure Web Push VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:dev@globalhawk.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Data Stores (Backed by PostgreSQL via Supabase in production)
let users = [
    {
        id: 'dev_1',
        username: 'WhiteHawk',
        email: 'dev@globalhawk.com',
        password: 'password123',
        walletAddress: '0x123...GlobalHawkDev',
        isVerified: true,
        isDeveloper: true,
        isFomo: false,
        fomoHandle: null,
        verificationToken: null
    }
];

let activeAlerts = [];
let activeWatchlists = [];
let bugReports = [];
let pushSubscriptions = [];

// Helper Validation
function isValidEmailFormat(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// -------------------------------------------------------------
// AUTHENTICATION & USER MANAGEMENT
// -------------------------------------------------------------

// Signup Endpoint with Automated Resend Email
app.post('/api/auth/signup', async (req, res) => {
    const { username, email, password, walletAddress, isFomo, fomoHandle } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email, and password are required." });
    }

    if (!isValidEmailFormat(email)) {
        return res.status(400).json({ error: "Invalid email format." });
    }

    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: "An account with that email already exists." });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const newUser = {
        id: 'usr_' + Date.now(),
        username,
        email,
        password,
        walletAddress: walletAddress || null,
        isVerified: false,
        isDeveloper: false,
        isFomo: !!isFomo,
        fomoHandle: fomoHandle || null,
        verificationToken: token,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);

    // Build absolute URL dynamically based on current host
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const verifyUrl = `${protocol}://${host}/api/auth/verify?token=${token}`;

    // Send Verification Email via Resend
    if (process.env.RESEND_API_KEY) {
        try {
            await resend.emails.send({
                from: 'Global Hawk <onboarding@resend.dev>',
                to: email,
                subject: 'Activate Your Global Hawk Account',
                html: `
                    <div style="font-family: Arial, sans-serif; background-color: #07090e; color: #f3f4f6; padding: 24px; border-radius: 12px; max-width: 500px; margin: auto;">
                        <h2 style="color: #00f2fe; margin-bottom: 8px;">Welcome to Global Hawk, @${username}!</h2>
                        <p style="font-size: 14px; color: #9ca3af; line-height: 1.5;">Please confirm your email address to activate your account and unlock access to the social trading watchtower.</p>
                        <a href="${verifyUrl}" style="display: inline-block; background: #00f2fe; color: #000; padding: 12px 24px; font-weight: bold; border-radius: 8px; text-decoration: none; margin-top: 16px; margin-bottom: 16px;">Confirm Email Address</a>
                        <p style="font-size: 11px; color: #666666;">If you didn't create this account, you can safely ignore this email.</p>
                    </div>
                `
            });
            console.log(`[EMAIL DISPATCHED] Sent verification link to ${email}`);
        } catch (emailErr) {
            console.error('[EMAIL ERROR] Failed to dispatch via Resend:', emailErr);
        }
    } else {
        console.log(`[DEV MODE] Resend key missing. Activation link for ${email}:${verifyUrl}`);
    }

    res.json({ user: newUser });
});

// Email Verification Endpoint
app.get('/api/auth/verify', (req, res) => {
    const { token } = req.query;
    const user = users.find(u => u.verificationToken === token);

    if (!user) {
        return res.status(400).send(`
            <div style="font-family: sans-serif; background: #07090e; color: #ff4d4d; text-align: center; padding: 50px;">
                <h1>Invalid or Expired Verification Token</h1>
                <p><a href="/" style="color: #00f2fe;">Return to Global Hawk Login</a></p>
            </div>
        `);
    }

    user.isVerified = true;
    user.verificationToken = null;

    res.send(`
        <div style="font-family: sans-serif; background: #07090e; color: #f3f4f6; text-align: center; padding: 50px;">
            <h1 style="color: #00f2fe;">Account Verified