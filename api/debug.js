// api/debug.js - Minimal test to check what's wrong
module.exports = async (req, res) => {
    try {
        // Check environment variables first
        const hasServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT;
        const hasSheetId = !!process.env.GOOGLE_SHEET_ID;
        
        let serviceAccountValid = false;
        let serviceAccountEmail = '';
        
        if (hasServiceAccount) {
            try {
                const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
                serviceAccountValid = true;
                serviceAccountEmail = credentials.client_email || 'Not found';
            } catch (e) {
                serviceAccountValid = false;
            }
        }
        
        // Try to import googleapis
        let googleapisAvailable = false;
        try {
            const { google } = require('googleapis');
            googleapisAvailable = true;
        } catch (e) {
            googleapisAvailable = false;
        }
        
        const debug = {
            timestamp: new Date().toISOString(),
            environment_variables: {
                GOOGLE_SERVICE_ACCOUNT: hasServiceAccount ? 'Present' : 'MISSING',
                GOOGLE_SHEET_ID: hasSheetId ? 'Present' : 'MISSING',
                service_account_valid: serviceAccountValid,
                service_account_email: serviceAccountEmail
            },
            dependencies: {
                googleapis_available: googleapisAvailable
            },
            sheet_info: {
                expected_sheet_id: process.env.GOOGLE_SHEET_ID || 'NOT SET',
                expected_sheet_name: 'Dynamic Club Page Hub'
            },
            next_steps: []
        };
        
        // Add specific next steps based on what's missing
        if (!hasServiceAccount) {
            debug.next_steps.push('Set GOOGLE_SERVICE_ACCOUNT environment variable in Vercel');
        }
        if (!hasSheetId) {
            debug.next_steps.push('Set GOOGLE_SHEET_ID environment variable in Vercel');
        }
        if (!serviceAccountValid) {
            debug.next_steps.push('Fix GOOGLE_SERVICE_ACCOUNT JSON format');
        }
        if (serviceAccountEmail && hasSheetId) {
            debug.next_steps.push(`Share Google Sheet with: ${serviceAccountEmail}`);
        }
        if (!googleapisAvailable) {
            debug.next_steps.push('Fix googleapis dependency');
        }
        
        if (debug.next_steps.length === 0) {
            debug.next_steps.push('All basic checks passed - try /api/test');
        }
        
        return res.status(200).json(debug);
        
    } catch (error) {
        return res.status(500).json({
            error: 'Debug failed',
            details: error.message,
            stack: error.stack
        });
    }
};
