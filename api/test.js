// api/test.js - Test endpoint to verify Google Sheets connection
module.exports = async (req, res) => {
    try {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'GET') {
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        console.log('Testing Google Sheets connection...');

        // Check environment variables
        if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
            return res.status(500).json({ 
                error: 'Missing GOOGLE_SERVICE_ACCOUNT environment variable',
                setup_required: true 
            });
        }

        if (!process.env.GOOGLE_SHEET_ID) {
            return res.status(500).json({ 
                error: 'Missing GOOGLE_SHEET_ID environment variable',
                setup_required: true 
            });
        }

        // Import googleapis
        const { google } = require('googleapis');

        let credentials;
        try {
            credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        } catch (parseError) {
            return res.status(500).json({ 
                error: 'Invalid GOOGLE_SERVICE_ACCOUNT JSON format',
                details: parseError.message 
            });
        }

        // Create auth and sheets client
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        console.log('Attempting to read spreadsheet metadata...');

        // Test basic connection by getting spreadsheet metadata
        const metadataResponse = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
        });

        const sheetNames = metadataResponse.data.sheets.map(sheet => sheet.properties.title);
        console.log('Available sheets:', sheetNames);

        // Test reading the specific sheet
        const sheetName = 'Dynamic Club Page Hub';
        let testReadResult;
        
        try {
            const testResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A1:C10`, // Test first few rows and columns
            });
            
            testReadResult = {
                success: true,
                rows_found: testResponse.data.values ? testResponse.data.values.length : 0,
                sample_data: testResponse.data.values ? testResponse.data.values.slice(0, 3) : []
            };
        } catch (readError) {
            testReadResult = {
                success: false,
                error: readError.message
            };
        }

        return res.status(200).json({
            status: 'success',
            message: 'Google Sheets connection working',
            spreadsheet: {
                id: spreadsheetId,
                title: metadataResponse.data.properties.title,
                available_sheets: sheetNames
            },
            target_sheet: sheetName,
            test_read: testReadResult,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in test API:', error);
        
        let errorDetails = {
            error: 'Connection test failed',
            details: error.message,
            timestamp: new Date().toISOString()
        };

        // Provide specific guidance for common errors
        if (error.message.includes('API key not valid')) {
            errorDetails.solution = 'Check your Google Service Account credentials and ensure the account has access to the spreadsheet';
        } else if (error.message.includes('not found')) {
            errorDetails.solution = 'Verify your GOOGLE_SHEET_ID is correct and the spreadsheet exists';
        } else if (error.message.includes('permission')) {
            errorDetails.solution = 'Share your Google Sheet with the service account email address';
        }

        return res.status(500).json(errorDetails);
    }
};
