// api/debug-headers.js - Debug endpoint to check actual column headers
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

        console.log('Debugging column headers...');

        // Import googleapis
        const { google } = require('googleapis');

        // Parse credentials
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

        // Create auth and sheets client
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        console.log('Reading headers from Dynamic Club Page Hub sheet...');

        // Read just the header row to see the structure
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Dynamic Club Page Hub!1:1', // Just the first row (headers)
        });

        const headers = headerResponse.data.values ? headerResponse.data.values[0] : [];
        console.log('Raw headers found:', headers.length);

        // Also read a sample data row to see actual data
        const sampleResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Dynamic Club Page Hub!2:2', // Second row (first data row)
        });

        const sampleData = sampleResponse.data.values ? sampleResponse.data.values[0] : [];
        console.log('Sample data row length:', sampleData.length);

        // Create a mapping of column index to header name
        const columnMapping = {};
        headers.forEach((header, index) => {
            if (header && header.trim()) {
                columnMapping[index] = {
                    letter: getColumnLetter(index),
                    header: header.trim(),
                    sampleValue: sampleData[index] || ''
                };
            }
        });

        // Return detailed debug information
        const debugInfo = {
            spreadsheet_id: spreadsheetId,
            sheet_name: 'Dynamic Club Page Hub',
            total_columns: headers.length,
            total_data_columns: sampleData.length,
            headers_raw: headers,
            sample_data_raw: sampleData,
            column_mapping: columnMapping,
            key_columns_check: {
                'club_id (A/0)': columnMapping[0] || 'MISSING',
                'club_name (B/1)': columnMapping[1] || 'MISSING',
                'active (C/2)': columnMapping[2] || 'MISSING',
                'activity_type (F/5)': columnMapping[5] || 'MISSING',
                'location (H/7)': columnMapping[7] || 'MISSING',
                'monthly_fee_amount (I/8)': columnMapping[8] || 'MISSING',
                'numeric_rating (L/11)': columnMapping[11] || 'MISSING',
                'member_count (N/13)': columnMapping[13] || 'MISSING',
                'email (CA/78)': columnMapping[78] || 'MISSING',
                'phone (CB/79)': columnMapping[79] || 'MISSING'
            },
            potential_issues: []
        };

        // Check for potential issues
        if (headers.length !== sampleData.length) {
            debugInfo.potential_issues.push(`Header count (${headers.length}) doesn't match data count (${sampleData.length})`);
        }

        if (!columnMapping[0] || !columnMapping[1]) {
            debugInfo.potential_issues.push('Missing basic club identification columns (club_id or club_name)');
        }

        if (!columnMapping[2]) {
            debugInfo.potential_issues.push('Missing active status column');
        }

        console.log('Returning debug info');
        res.status(200).json(debugInfo);

    } catch (error) {
        console.error('Error in debug-headers API:', error);
        return res.status(500).json({ 
            error: 'Debug failed', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Helper function to convert column index to letter (A, B, C, etc.)
function getColumnLetter(index) {
    let letter = '';
    while (index >= 0) {
        letter = String.fromCharCode(65 + (index % 26)) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
}
