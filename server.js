import express from 'express';
import webpush from 'web-push';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

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
let bugQueue = [];

function isValidEmailFormat(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

// 1. SIGN UP (SUPPORTS DIRECT FOMO ACCOUNT LINKING)
app.post('/api/auth/signup', (req, res) => {
    const { username, email, password, walletAddress, isFomo, fomoHandle } = req.body;

    if (!isValidEmailFormat(email)) {
        return res.status(400).json({ error: "Invalid email format." });
    }

    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: "Account with that email already exists." });
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
        verificationToken: token
    };

    users.push(newUser);
    console.log(`[GLOBAL HAWK AUTH] Activation Link for ${email}: /api/auth/verify?token=${token}`);

    res.json({ user: newUser });
});

// 2. SIGN IN
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

    if (!user) {
        return res.status(401).json({ error: "Invalid email or password." });
    }

    res.json({ user });
});

// 3. EMAIL VERIFICATION ROUTE
app.get('/api/auth/verify', (req, res) => {
    const { token } = req.query;
    const user = users.find(u => u.verificationToken === token);

    if (!user) {
        return res.status(400).send("<h3>Invalid token.</h3>");
    }

    user.isVerified = true;
    user.verificationToken = null;
    res.send("<h3>Global Hawk Email Confirmed! Return to the app and sign in.</h3>");
});

app.get('/api/auth/status/:id', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    res.json({ isVerified: user ? user.isVerified : false });
});

// 4. DEVELOPER TELEMETRY PORTAL
app.get('/api/dev/stats', (req, res) => {
    const { userId } = req.query;
    const user = users.find(u => u.id === userId);

    if (!user || !user.isDeveloper) {
        return res.status(403).json({ error: "Forbidden. Developer privileges required." });
    }

    res.json({
        totalUsers: users.length,
        unverifiedUsers: users.filter(u => !u.isVerified).length,
        devCount: users.filter(u => u.isDeveloper).length,
        activeAlertsCount: activeAlerts.length,
        activeWatchlistsCount: activeWatchlists.length,
        bugs: bugQueue
    });
});

// 5. BUG REPORT QUEUE
app.post('/api/bugs/report', (req, res) => {
    const { userId, text } = req.body;
    bugQueue.push({ id: 'bug_' + Date.now(), userId, text, date: new Date() });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Global Hawk Server running on http://localhost:${PORT}`));