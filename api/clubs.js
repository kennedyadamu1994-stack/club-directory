// api/clubs.js - Fetch all active clubs data with corrected column mapping and faster freshness
module.exports = async (req, res) => {
  try {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Faster updates without hammering Sheets: 15s edge cache, 5s stale
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=5');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
      return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    // Google Sheets client
    const { google } = require('googleapis');
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Pull everything we might need
    const range = 'Dynamic Club Page Hub!A:CZ';
    const clubResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = clubResponse.data.values || [];
    if (!rows.length) return res.status(404).json({ error: 'No club data found' });

    const headers = rows[0] || [];
    const out = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];

      // Active (column C) supports yes/true/1
      const activeCell = (row[2] || '').toString().trim().toLowerCase();
      const isActive = ['yes', 'true', '1'].includes(activeCell);
      if (!isActive) continue;

      const club = parseClubRow(row);

      // Derive / legacy compatibility
      club.tags_array = [club.tags_who, club.tags_vibe, club.tags_accessibility].filter(Boolean);
      club.facilities_array = club.facilities_list
        ? club.facilities_list.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      club.is_beginner_friendly = (club.tags_who || '').toLowerCase().includes('beginner');
      const acc = (club.tags_accessibility || '').toLowerCase();
      club.is_wheelchair_accessible = acc.includes('wheelchair') || acc.includes('accessible');
      club.is_all_ages = (club.tags_who || '').toLowerCase().includes('all ages');

      // Keep some legacy fields your front-end expects
      club.monthly_fee = club.monthly_fee_amount;
      club.description = club.club_bio;
      club.rating = club.numeric_rating;
      club.user_rating = club.numeric_rating;
      club.review_count = 0; // directory doesn’t need the full testimonials payload
      club.total_members = club.member_count;
      club.age_groups = club.tags_who;
      // Keep skill_levels for filter menu; don’t render it in the card UI
      club.skill_levels = 'All levels';
      club.tags = club.tags_array.join(', ');
      club.facilities = club.facilities_list;
      club.instructor_name = club.coach_name;
      club.instructor_bio = club.coach_role;
      club.featured = club.ranking_category === 'Featured' || false;

      // URL routing code
      club.club_code = makeSlug((club.club_id || club.club_name || '').toString());

      out.push(club);
    }

    return res.status(200).json(out);
  } catch (err) {
    console.error('Error in clubs API:', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};

// ---------- Helpers ----------
function safeGet(row, index) {
  const v = row[index] ?? '';
  return v === 'N/A' ? '' : v;
}
function safeFloat(row, index) {
  const v = safeGet(row, index);
  if (v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function safeInt(row, index) {
  const v = safeGet(row, index);
  if (v === '') return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}
function makeSlug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseClubRow(row) {
  // Columns aligned to the sheet structure used in club-data.js
  return {
    // Basic (A-C)
    club_id: safeGet(row, 0),
    club_name: safeGet(row, 1) || 'Unknown Club',
    active: safeGet(row, 2) || 'no',

    // URLs (D-E)
    page_url: safeGet(row, 3),
    booking_url: safeGet(row, 4),

    // Details (F-S)
    activity_type: safeGet(row, 5),
    club_logo_emoji: safeGet(row, 6), // may be emoji or image URL; front-end handles it
    location: safeGet(row, 7),
    monthly_fee_amount: safeFloat(row, 8),
    monthly_fee_text: safeGet(row, 9),
    star_rating: safeGet(row, 10), // out of 5 (display as stars)
    numeric_rating: safeFloat(row, 11), // out of 10 (overlay + numeric)
    rating_out_of: safeFloat(row, 12) || 5,
    member_count: safeInt(row, 13),
    ranking_position: safeInt(row, 14),
    ranking_category: safeGet(row, 15),
    sessions_per_week: safeInt(row, 16),
    average_attendance: safeInt(row, 17),
    member_growth: safeGet(row, 18),

    // About & Coach (BS-BV: 70-73)
    club_bio: safeGet(row, 70),
    coach_name: safeGet(row, 71),
    coach_role: safeGet(row, 72),
    coach_avatar: safeGet(row, 73),

    // Facilities & Tags (BW-BZ: 74-77)
    facilities_list: safeGet(row, 74),
    tags_who: safeGet(row, 75),
    tags_vibe: safeGet(row, 76),
    tags_accessibility: safeGet(row, 77),

    // Contact (CA-CE: 78-82)
    email: safeGet(row, 78),
    phone: safeGet(row, 79),
    whatsapp: safeGet(row, 80),
    instagram: safeGet(row, 81),
    address: safeGet(row, 82),

    // Design + Image (CF-CG: 83-84)
    hero_background_gradient: safeGet(row, 83),
    image_url: safeGet(row, 84) || '',

    // Audience (CH: 85)
    audience: safeGet(row, 85) || '',
  };
}
