// api/club-data.js - Individual club data retrieval with caching
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

        const { code } = req.query;
        console.log('API called with club code:', code);

        if (!code) {
            return res.status(400).json({ error: 'Club code is required' });
        }

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

        console.log('Reading from Clubs sheet...');

        // Read club data
        const clubResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Clubs!A:AD', // Full range to get all club data
        });

        const clubRows = clubResponse.data.values;
        console.log('Club rows found:', clubRows ? clubRows.length : 0);

        if (!clubRows || clubRows.length === 0) {
            return res.status(404).json({ error: 'No club data found in Clubs sheet' });
        }

        // Find the club by code (column B)
        const headers = clubRows[0];
        console.log('Club headers:', headers);
        
        const clubCodeIndex = 1; // Column B (0-indexed)
        const activeIndex = 23;  // Column X (0-indexed)
        
        const clubRow = clubRows.find((row, index) => {
            if (index === 0) return false; // Skip header
            return row[clubCodeIndex] && 
                   row[clubCodeIndex].toLowerCase() === code.toLowerCase() &&
                   row[activeIndex] === 'yes'; // Only active clubs
        });

        if (!clubRow) {
            console.log('Club not found for code:', code);
            return res.status(404).json({
                error: 'Club not found',
                debug_info: {
                    searched_code: code,
                    available_codes: clubRows.slice(1)
                        .filter(row => row[activeIndex] === 'yes')
                        .map(row => row[clubCodeIndex])
                        .filter(Boolean),
                    total_active_clubs: clubRows.slice(1).filter(row => row[activeIndex] === 'yes').length
                }
            });
        }

        console.log('Found club row:', clubRow);

        // Parse club data with all fields
        const clubData = parseClubData(clubRow);

        // Add computed properties
        clubData.seo = generateSEOData(clubData);
        clubData.structured_data = generateStructuredData(clubData);

        console.log('Returning club data:', clubData.club_name);
        res.status(200).json(clubData);

    } catch (error) {
        console.error('Error in club-data API:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Helper function to parse club data from sheet row
function parseClubData(row) {
    const club = {
        // Basic Info (A-L)
        club_id: row[0] || '',
        club_code: row[1] || '',
        club_name: row[2] || 'Unknown Club',
        activity_type: row[3] || '',
        location: row[4] || '',
        address: row[5] || '',
        monthly_fee: parseFloat(row[6]) || 0,
        description: row[7] || '',
        image_url: row[8] || '',
        website: row[9] || '',
        phone: row[10] || '',
        email: row[11] || '',
        
        // Ratings & Stats (M-Q)
        rating: parseFloat(row[12]) || 0,
        user_rating: parseFloat(row[13]) || 0,
        review_count: parseInt(row[14]) || 0,
        total_members: parseInt(row[15]) || 0,
        sessions_per_week: parseInt(row[16]) || 0,
        
        // Categories & Tags (R-U)
        age_groups: row[17] || '',
        skill_levels: row[18] || '',
        tags: row[19] || '',
        facilities: row[20] || '',
        
        // Instructor Info (V-W)
        instructor_name: row[21] || '',
        instructor_bio: row[22] || '',
        
        // Status & URLs (X-AB)
        active: row[23] || 'no',
        featured: row[24] === 'yes',
        booking_url: row[25] || '',
        page_url: row[26] || '',
        admin_url: row[27] || '',
        
        // Performance Scores (AC-AH)
        sportsmanship_score: parseFloat(row[28]) || 0,
        organisation_score: parseFloat(row[29]) || 0,
        competitiveness_score: parseFloat(row[30]) || 0,
        equipment_venues_score: parseFloat(row[31]) || 0,
        friendliness_score: parseFloat(row[32]) || 0,
        skill_level_score: parseFloat(row[33]) || 0,
        
        // Timestamps (AI-AJ)
        created_date: row[34] || '',
        last_updated: row[35] || ''
    };

    // Add computed properties
    club.tags_array = club.tags ? club.tags.split(',').map(tag => tag.trim()) : [];
    club.facilities_array = club.facilities ? club.facilities.split(',').map(facility => facility.trim()) : [];
    club.is_beginner_friendly = club.tags.toLowerCase().includes('beginner');
    club.is_wheelchair_accessible = club.facilities.toLowerCase().includes('wheelchair');
    club.is_all_ages = club.age_groups.toLowerCase().includes('all ages');
    
    // Calculate average performance score
    const scores = [
        club.sportsmanship_score,
        club.organisation_score, 
        club.competitiveness_score,
        club.equipment_venues_score,
        club.friendliness_score,
        club.skill_level_score
    ].filter(score => score > 0);
    
    club.average_performance_score = scores.length > 0 ? 
        scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

    return club;
}

// Helper function to generate SEO data
function generateSEOData(club) {
    return {
        title: `${club.club_name} - ${club.activity_type} in ${club.location}`,
        description: `Join ${club.club_name} for ${club.activity_type} in ${club.location}. ${club.total_members} members, ${club.rating}/5 rating. From £${club.monthly_fee}/month.`,
        keywords: [
            club.activity_type,
            club.location,
            club.club_name,
            ...club.tags_array,
            'fitness club',
            'local community',
            'sports'
        ].filter(Boolean).join(', '),
        canonical_url: club.page_url,
        og_image: club.image_url,
        og_type: 'website'
    };
}

// Helper function to generate structured data
function generateStructuredData(club) {
    return {
        "@context": "https://schema.org",
        "@type": "SportsClub",
        "name": club.club_name,
        "description": club.description,
        "url": club.website,
        "logo": club.image_url,
        "image": club.image_url,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": club.address,
            "addressLocality": club.location,
            "addressCountry": "GB"
        },
        "telephone": club.phone,
        "email": club.email,
        "priceRange": club.monthly_fee > 0 ? `£${club.monthly_fee}` : "Free",
        "aggregateRating": club.review_count > 0 ? {
            "@type": "AggregateRating",
            "ratingValue": club.rating,
            "reviewCount": club.review_count,
            "bestRating": 5,
            "worstRating": 1
        } : undefined,
        "offers": {
            "@type": "Offer",
            "name": `${club.club_name} Membership`,
            "price": club.monthly_fee,
            "priceCurrency": "GBP",
            "availability": "https://schema.org/InStock",
            "validFrom": new Date().toISOString().split('T')[0]
        },
        "amenityFeature": club.facilities_array.map(facility => ({
            "@type": "LocationFeatureSpecification",
            "name": facility
        })),
        "sport": club.activity_type,
        "memberOf": {
            "@type": "Organization",
            "name": "NBRH Network"
        }
    };
}

// Cache refresh endpoint
// api/refresh-cache.js
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // This endpoint can be called by Vercel cron or webhooks
        // to refresh the cache periodically
        
        const { google } = require('googleapis');
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // Fetch latest data to warm the cache
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Clubs!A:AD',
        });

        const activeClubs = response.data.values
            .slice(1) // Skip header
            .filter(row => row[23] === 'yes') // Only active clubs
            .length;

        console.log(`Cache refresh: Found ${activeClubs} active clubs`);

        res.status(200).json({ 
            success: true, 
            message: `Cache refreshed successfully`,
            active_clubs: activeClubs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cache refresh error:', error);
        res.status(500).json({ 
            error: 'Cache refresh failed', 
            details: error.message 
        });
    }
};
