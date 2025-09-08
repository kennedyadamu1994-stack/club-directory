// api/clubs.js - Fetch all active clubs data with corrected column mapping
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
        
        // Parse all active clubs using the corrected column structure
        const clubs = [];
        
        for (let i = 1; i < clubRows.length; i++) {
            const row = clubRows[i];
            
            // Check if club is active (column C - index 2)
            const isActive = row[2] && row[2].toString().toLowerCase() === 'yes';
            
            if (!isActive) {
                continue; // Skip inactive clubs
            }

            // Parse club data with consistent column mapping
            const club = parseClubDataForListing(row);
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

// Helper function to parse club data from sheet row for listing (consistent with club-data.js)
function parseClubDataForListing(row) {
    // Helper functions for safe data extraction, treating "N/A" as empty
    const safeGet = (index) => {
        const value = row[index] || '';
        return value === 'N/A' ? '' : value;
    };
    const safeGetFloat = (index) => {
        const value = row[index] || '';
        if (value === 'N/A' || value === '') return 0;
        return parseFloat(value) || 0;
    };
    const safeGetInt = (index) => {
        const value = row[index] || '';
        if (value === 'N/A' || value === '') return 0;
        return parseInt(value) || 0;
    };

    const club = {
        // Basic Info (A-C: columns 0-2)
        club_id: safeGet(0),
        club_name: safeGet(1) || 'Unknown Club',
        active: safeGet(2) || 'no',
        
        // URLs (D-E: columns 3-4)
        page_url: safeGet(3),
        booking_url: safeGet(4),
        
        // Club Details (F-S: columns 5-18)
        activity_type: safeGet(5),
        club_logo_emoji: safeGet(6) || '🏛️',
        location: safeGet(7),
        monthly_fee_amount: safeGetFloat(8),
        monthly_fee_text: safeGet(9),
        star_rating: safeGet(10),
        numeric_rating: safeGetFloat(11),
        rating_out_of: safeGetFloat(12) || 5,
        member_count: safeGetInt(13),
        ranking_position: safeGetInt(14),
        ranking_category: safeGet(15),
        sessions_per_week: safeGetInt(16),
        average_attendance: safeGetInt(17),
        member_growth: safeGet(18),
        
        // About & Coach (BS-BV: columns 70-73)
        club_bio: safeGet(70),
        coach_name: safeGet(71),
        coach_role: safeGet(72),
        coach_avatar: safeGet(73),
        
        // Facilities & Tags (BW-BZ: columns 74-77)
        facilities_list: safeGet(74),
        tags_who: safeGet(75),
        tags_vibe: safeGet(76),
        tags_accessibility: safeGet(77),
        
        // Contact (CA-CE: columns 78-82)
        email: safeGet(78),
        phone: safeGet(79),
        whatsapp: safeGet(80),
        instagram: safeGet(81),
        address: safeGet(82),
        
        // Design (CF: column 83)
        hero_background_gradient: safeGet(83),
    };

    // Parse testimonials for review count (columns 31-39)
    const testimonials = [];
    for (let i = 0; i < 3; i++) {
        const baseIndex = 31 + (i * 3);
        const testimonial = {
            name: safeGet(baseIndex),
            rating: safeGetFloat(baseIndex + 1),
            text: safeGet(baseIndex + 2)
        };
        if (testimonial.name && testimonial.text) {
            testimonials.push({
                author: testimonial.name,
                rating: testimonial.rating,
                text: testimonial.text
            });
        }
    }
    club.testimonials = testimonials;

    // Add computed properties
    club.tags_array = [club.tags_who, club.tags_vibe, club.tags_accessibility].filter(Boolean);
    club.facilities_array = club.facilities_list ? club.facilities_list.split(',').map(f => f.trim()) : [];
    club.is_beginner_friendly = (club.tags_who || '').toLowerCase().includes('beginner');
    club.is_wheelchair_accessible = (club.tags_accessibility || '').toLowerCase().includes('wheelchair') || 
                                   (club.tags_accessibility || '').toLowerCase().includes('accessible');
    club.is_all_ages = (club.tags_who || '').toLowerCase().includes('all ages');

    // Legacy fields for compatibility with existing frontend
    club.monthly_fee = club.monthly_fee_amount;
    club.description = club.club_bio;
    club.rating = club.numeric_rating;
    club.user_rating = club.numeric_rating;
    club.review_count = club.testimonials.length;
    club.total_members = club.member_count;
    club.age_groups = club.tags_who;
    club.skill_levels = 'All levels'; // Default since not specified in new structure
    club.tags = club.tags_array.join(', ');
    club.facilities = club.facilities_list;
    club.instructor_name = club.coach_name;
    club.instructor_bio = club.coach_role;
    club.featured = club.ranking_category === 'Featured' || false;
    club.website = ''; // Not in new structure
   club.image_url = safeGet(84) || `https://source.unsplash.com/featured/?${club.activity_type || 'fitness'}`;
    
    // Generate club_code from club_id or club_name for URL routing
    club.club_code = (club.club_id || club.club_name)?.toString().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || '';

    return club;
}
