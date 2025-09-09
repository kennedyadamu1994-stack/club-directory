// api/club-data.js - Individual club data retrieval with corrected column mapping
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

        console.log('Reading from Dynamic Club Page Hub sheet...');

        // Read club data - using the correct sheet name and range
        const clubResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Dynamic Club Page Hub!A:CZ', // Full range to get all club data
        });

        const clubRows = clubResponse.data.values;
        console.log('Club rows found:', clubRows ? clubRows.length : 0);

        if (!clubRows || clubRows.length === 0) {
            return res.status(404).json({ error: 'No club data found in Dynamic Club Page Hub sheet' });
        }

        // Find the club by code (column A - club_id OR column B - club_name)
        const headers = clubRows[0];
        console.log('Club headers:', headers.slice(0, 10)); // Log first 10 headers
        
        const clubRow = clubRows.find((row, index) => {
            if (index === 0) return false; // Skip header
            
            // Check if club is active (column C)
            const isActive = row[2] && row[2].toString().toLowerCase() === 'yes';
            if (!isActive) return false;
            
            // Check club_id (column A) or club_name (column B)
            const clubId = row[0];
            const clubName = row[1];
            
            // Generate URL-friendly identifier from club_id or club_name
            const urlIdentifier = (clubId || clubName)?.toString().toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
            
            return urlIdentifier === code.toLowerCase();
        });

        if (!clubRow) {
            console.log('Club not found for code:', code);
            
            // Get available codes for debugging
            const availableCodes = clubRows.slice(1)
                .filter(row => row[2] && row[2].toString().toLowerCase() === 'yes') // Only active clubs
                .map(row => {
                    const clubId = row[0];
                    const clubName = row[1];
                    return (clubId || clubName)?.toString().toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-|-$)/g, '');
                })
                .filter(Boolean);
            
            return res.status(404).json({
                error: 'Club not found',
                debug_info: {
                    searched_code: code,
                    available_codes: availableCodes,
                    total_active_clubs: availableCodes.length
                }
            });
        }

        console.log('Found club row:', clubRow.slice(0, 5)); // Log first 5 columns

        // Parse club data with corrected column mapping
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

// Helper function to parse club data from sheet row with corrected column structure
function parseClubData(row) {
    // Helper function to safely get array values, treating "N/A" as empty
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
        // Basic Info (A-C)
        club_id: safeGet(0),
        club_name: safeGet(1) || 'Unknown Club',
        active: safeGet(2) || 'no',
        
        // URLs (D-E)
        page_url: safeGet(3),
        booking_url: safeGet(4),
        
        // Club Details (F-S)
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
        
        // Sessions (T-AB: columns 19-30)
        sessions: [],
        
        // Testimonials (AF-AN: columns 31-39)
        testimonials: [],
        
        // Benefits (AO-BF: columns 40-57)
        benefits: [],
        
        // Pricing (BG-BH: columns 58-59)
        pay_per_session_price: safeGetFloat(58),
        savings_amount: safeGetFloat(59),
        
        // FAQs (BI-BR: columns 60-69)
        faqs: [],
        
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
        
        // Image URL (CG: column 84)
        image_url: safeGet(84) || ''
    };

    // Parse Sessions (4 sessions: columns 19-30)
    for (let i = 0; i < 4; i++) {
        const baseIndex = 19 + (i * 3);
        const session = {
            time: safeGet(baseIndex),
            date: safeGet(baseIndex + 1),
            type: safeGet(baseIndex + 2)
        };
        if (session.time && session.date) {
            club.sessions.push(session);
        }
    }

    // Parse Testimonials (3 testimonials: columns 31-39)
    for (let i = 0; i < 3; i++) {
        const baseIndex = 31 + (i * 3);
        const testimonial = {
            name: safeGet(baseIndex),
            rating: safeGetFloat(baseIndex + 1),
            text: safeGet(baseIndex + 2)
        };
        if (testimonial.name && testimonial.text) {
            club.testimonials.push({
                author: testimonial.name,
                rating: testimonial.rating,
                text: testimonial.text
            });
        }
    }

    // Parse Benefits (6 benefits: columns 40-57)
    for (let i = 0; i < 6; i++) {
        const baseIndex = 40 + (i * 3);
        const benefit = {
            icon: safeGet(baseIndex),
            title: safeGet(baseIndex + 1),
            description: safeGet(baseIndex + 2)
        };
        if (benefit.title && benefit.description) {
            club.benefits.push(benefit);
        }
    }

    // Parse FAQs (5 FAQs: columns 60-69)
    for (let i = 0; i < 5; i++) {
        const baseIndex = 60 + (i * 2);
        const faq = {
            question: safeGet(baseIndex),
            answer: safeGet(baseIndex + 1)
        };
        if (faq.question && faq.answer) {
            club.faqs.push(faq);
        }
    }

    // Add computed properties
    club.tags_array = [club.tags_who, club.tags_vibe, club.tags_accessibility].filter(Boolean);
    club.facilities_array = club.facilities_list ? club.facilities_list.split(',').map(f => f.trim()) : [];
    club.is_beginner_friendly = (club.tags_who || '').toLowerCase().includes('beginner');
    club.is_wheelchair_accessible = (club.tags_accessibility || '').toLowerCase().includes('wheelchair');
    club.is_all_ages = (club.tags_who || '').toLowerCase().includes('all ages');
    
    // Calculate review count from testimonials
    club.review_count = club.testimonials.length;

    // Legacy fields for compatibility
    club.monthly_fee = club.monthly_fee_amount;
    club.description = club.club_bio;
    club.rating = club.numeric_rating;
    club.user_rating = club.numeric_rating;
    club.total_members = club.member_count;
    club.age_groups = club.tags_who;
    club.skill_levels = 'All levels';
    club.tags = club.tags_array.join(', ');
    club.facilities = club.facilities_list;
    club.instructor_name = club.coach_name;
    club.instructor_bio = club.coach_role;
    club.featured = club.ranking_category === 'Featured' || false;
    club.website = '';
    
    // Generate club_code from club_id or club_name
    club.club_code = (club.club_id || club.club_name)?.toString().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || '';

    return club;
}

// Helper function to generate SEO data
function generateSEOData(club) {
    return {
        title: `${club.club_name} - ${club.activity_type} in ${club.location}`,
        description: `Join ${club.club_name} for ${club.activity_type} in ${club.location}. ${club.member_count} members, ${club.numeric_rating}/5 rating. From £${club.monthly_fee_amount}/month.`,
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
        "description": club.club_bio,
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
        "priceRange": club.monthly_fee_amount > 0 ? `£${club.monthly_fee_amount}` : "Free",
        "aggregateRating": club.review_count > 0 ? {
            "@type": "AggregateRating",
            "ratingValue": club.numeric_rating,
            "reviewCount": club.review_count,
            "bestRating": club.rating_out_of || 5,
            "worstRating": 1
        } : undefined,
        "offers": {
            "@type": "Offer",
            "name": `${club.club_name} Membership`,
            "price": club.monthly_fee_amount,
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
