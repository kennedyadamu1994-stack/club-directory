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

        console.log('Reading from Dynamic Club Page Hub sheet...');

        // Read club data - using the correct sheet name and range
        const clubResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Dynamic Club Page Hub!A:CF', // Full range to get all club data
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

        // Parse club data with all fields according to Apps Script structure
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

// Helper function to parse club data from sheet row according to Apps Script column structure
function parseClubData(row) {
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
        sessions: [
            {
                time: row[19] || '',
                date: row[20] || '',
                type: row[21] || ''
            },
            {
                time: row[22] || '',
                date: row[23] || '',
                type: row[24] || ''
            },
            {
                time: row[25] || '',
                date: row[26] || '',
                type: row[27] || ''
            },
            {
                time: row[28] || '',
                date: row[29] || '',
                type: row[30] || ''
            }
        ].filter(s => s.time && s.date), // Only include complete sessions
        
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
        review_count: 0, // Calculated from testimonials
        total_members: parseInt(row[13]) || 0,
        age_groups: row[75] || '', // tags_who
        skill_levels: 'All levels', // Default since not in new structure
        tags: [row[75], row[76], row[77]].filter(Boolean).join(', '),
        facilities: row[74] || '',
        instructor_name: row[71] || '',
        instructor_bio: row[72] || '',
        featured: row[15] === 'Featured' || false,
        website: '', // Not in new structure
        image_url: `https://source.unsplash.com/featured/?${row[5]||'fitness'}`,
        
        // Generate club_code from club_id or club_name
        club_code: (row[0] || row[1])?.toString().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || '',
    };

    // Add computed properties
    club.tags_array = club.tags ? club.tags.split(',').map(tag => tag.trim()) : [];
    club.facilities_array = club.facilities ? club.facilities.split(',').map(facility => facility.trim()) : [];
    club.is_beginner_friendly = (club.tags_who || '').toLowerCase().includes('beginner');
    club.is_wheelchair_accessible = (club.tags_accessibility || '').toLowerCase().includes('wheelchair');
    club.is_all_ages = (club.tags_who || '').toLowerCase().includes('all ages');
    
    // Calculate review count from testimonials
    club.review_count = club.testimonials.length;

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
