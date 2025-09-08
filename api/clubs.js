// api/clubs.js - Fetch all active clubs data
module.exports = async (req, res) => {
    try {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'GET') {
            return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }

        console.log('Loading all clubs data...');

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

        console.log('Reading from Dynamic Club Page Hub sheet...');

        // Read club data - using the correct sheet name from your Apps Script
        const clubResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Dynamic Club Page Hub!A:CF', // Full range to get all club data including new columns
        });

        const clubRows = clubResponse.data.values;
        console.log('Club rows found:', clubRows ? clubRows.length : 0);

        if (!clubRows || clubRows.length === 0) {
            return res.status(404).json({ error: 'No club data found in Dynamic Club Page Hub sheet' });
        }

        const headers = clubRows[0];
        console.log('Club headers found:', headers.length);
        
        // Parse all active clubs using the column structure from your Apps Script
        const clubs = [];
        
        for (let i = 1; i < clubRows.length; i++) {
            const row = clubRows[i];
            
            // Check if club is active (column C - index 2)
            const isActive = row[2] && row[2].toString().toLowerCase() === 'yes';
            
            if (!isActive) {
                continue; // Skip inactive clubs
            }

            // Parse club data according to your Apps Script column structure
            const club = {
                // Basic Info (A-C)
                club_id: row[0] || '',
                club_name: row[1] || 'Unknown Club',
                active: row[2] || 'no',
                
                // URLs (D-E) - auto-generated
                page_url: row[3] || '',
                booking_url: row[4] || '',
                
                // Club Details (F-S)
                activity_type: row[5] || '',
                club_logo_emoji: row[6] || '🏛️',
                location: row[7] || '',
                monthly_fee_amount: parseFloat(row[8]) || 0,
                monthly_fee_text: row[9] || '',
                star_rating: row[10] || '',
                numeric_rating: parseFloat(row[11]) || 0,
                rating_out_of: parseFloat(row[12]) || 5,
                member_count: parseInt(row[13]) || 0,
                ranking_position: parseInt(row[14]) || 0,
                ranking_category: row[15] || '',
                sessions_per_week: parseInt(row[16]) || 0,
                average_attendance: parseInt(row[17]) || 0,
                member_growth: row[18] || '',
                
                // Sessions (T-AB)
                session_1_time: row[19] || '',
                session_1_date: row[20] || '',
                session_1_type: row[21] || '',
                session_2_time: row[22] || '',
                session_2_date: row[23] || '',
                session_2_type: row[24] || '',
                session_3_time: row[25] || '',
                session_3_date: row[26] || '',
                session_3_type: row[27] || '',
                session_4_time: row[28] || '',
                session_4_date: row[29] || '',
                session_4_type: row[30] || '',
                
                // Testimonials (AF-AN)
                testimonials: [
                    {
                        name: row[31] || '',
                        rating: parseFloat(row[32]) || 0,
                        text: row[33] || ''
                    },
                    {
                        name: row[34] || '',
                        rating: parseFloat(row[35]) || 0,
                        text: row[36] || ''
                    },
                    {
                        name: row[37] || '',
                        rating: parseFloat(row[38]) || 0,
                        text: row[39] || ''
                    }
                ].filter(t => t.name && t.text), // Only include complete testimonials
                
                // Benefits (AO-BF)
                benefits: [
                    {
                        icon: row[40] || '',
                        title: row[41] || '',
                        description: row[42] || ''
                    },
                    {
                        icon: row[43] || '',
                        title: row[44] || '',
                        description: row[45] || ''
                    },
                    {
                        icon: row[46] || '',
                        title: row[47] || '',
                        description: row[48] || ''
                    },
                    {
                        icon: row[49] || '',
                        title: row[50] || '',
                        description: row[51] || ''
                    },
                    {
                        icon: row[52] || '',
                        title: row[53] || '',
                        description: row[54] || ''
                    },
                    {
                        icon: row[55] || '',
                        title: row[56] || '',
                        description: row[57] || ''
                    }
                ].filter(b => b.title && b.description), // Only include complete benefits
                
                // Pricing (BG-BH)
                pay_per_session_price: parseFloat(row[58]) || 0,
                savings_amount: parseFloat(row[59]) || 0,
                
                // FAQs (BI-BR)
                faqs: [
                    {
                        question: row[60] || '',
                        answer: row[61] || ''
                    },
                    {
                        question: row[62] || '',
                        answer: row[63] || ''
                    },
                    {
                        question: row[64] || '',
                        answer: row[65] || ''
                    },
                    {
                        question: row[66] || '',
                        answer: row[67] || ''
                    },
                    {
                        question: row[68] || '',
                        answer: row[69] || ''
                    }
                ].filter(f => f.question && f.answer), // Only include complete FAQs
                
                // About & Coach (BS-BV)
                club_bio: row[70] || '',
                coach_name: row[71] || '',
                coach_role: row[72] || '',
                coach_avatar: row[73] || '',
                
                // Facilities & Tags (BW-BZ)
                facilities_list: row[74] || '',
                tags_who: row[75] || '',
                tags_vibe: row[76] || '',
                tags_accessibility: row[77] || '',
                
                // Contact (CA-CE)
                email: row[78] || '',
                phone: row[79] || '',
                whatsapp: row[80] || '',
                instagram: row[81] || '',
                address: row[82] || '',
                
                // Design (CF)
                hero_background_gradient: row[83] || '',
                
                // Legacy fields for compatibility
                monthly_fee: parseFloat(row[8]) || 0,
                description: row[70] || '', // club_bio
                rating: parseFloat(row[11]) || 0, // numeric_rating
                user_rating: parseFloat(row[11]) || 0,
                review_count: 0, // Not in new structure
                total_members: parseInt(row[13]) || 0,
                age_groups: row[75] || '', // tags_who
                skill_levels: 'All levels', // Default
                tags: [row[75], row[76], row[77]].filter(Boolean).join(', '),
                facilities: row[74] || '',
                instructor_name: row[71] || '',
                instructor_bio: row[72] || '',
                featured: row[15] === 'Featured' || false,
                website: '', // Not in new structure
                image_url: `https://source.unsplash.com/featured/?${row[5]||'fitness'}`,
                
                // Generate club_code from club_name if not provided
                club_code: row[0] || row[1]?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '',
                
                // Computed properties
                is_beginner_friendly: (row[75] || '').toLowerCase().includes('beginner'),
                is_wheelchair_accessible: (row[77] || '').toLowerCase().includes('wheelchair'),
                is_all_ages: (row[75] || '').toLowerCase().includes('all ages')
            };
            
            clubs.push(club);
        }

        console.log(`Returning ${clubs.length} active clubs`);
        res.status(200).json(clubs);

    } catch (error) {
        console.error('Error in clubs API:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
