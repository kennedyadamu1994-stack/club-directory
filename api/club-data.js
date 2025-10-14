// api/club-data.js — Individual club data retrieval (freshness + complete column mapping)

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

    const code = (req.query.code || '').toString().trim().toLowerCase();
    if (!code) return res.status(400).json({ error: 'Club code is required' });

    // Google Sheets client
    const { google } = require('googleapis');
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const range = 'Dynamic Club Page Hub!A:CZ';
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = resp.data.values || [];
    if (!rows.length) return res.status(404).json({ error: 'No club data found' });

    const header = rows[0];

    // Find the club row by URL-safe slug of club_id or club_name, and active = yes/true/1
    let found = null;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const activeCell = (r[2] || '').toString().trim().toLowerCase();
      const isActive = ['yes', 'true', '1'].includes(activeCell);
      if (!isActive) continue;

      const clubId = (r[0] || '').toString();
      const clubName = (r[1] || '').toString();
      const slug = makeSlug(clubId || clubName);
      if (slug === code) { found = r; break; }
    }

    if (!found) {
      // Provide some debug hints of available codes
      const available = rows.slice(1).filter(r => {
        const activeCell = (r[2] || '').toString().trim().toLowerCase();
        return ['yes', 'true', '1'].includes(activeCell);
      }).map(r => makeSlug((r[0] || r[1] || '').toString())).filter(Boolean);

      return res.status(404).json({
        error: 'Club not found',
        debug_info: { searched_code: code, available_codes: available.slice(0, 50), total_active_clubs: available.length }
      });
    }

    const club = parseClubRow(found);

    // Derived / compatibility
    club.tags_array = [club.tags_who, club.tags_vibe, club.tags_accessibility].filter(Boolean);
    club.facilities_array = club.facilities_list
      ? club.facilities_list.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    club.is_beginner_friendly = (club.tags_who || '').toLowerCase().includes('beginner');
    const acc = (club.tags_accessibility || '').toLowerCase();
    club.is_wheelchair_accessible = acc.includes('wheelchair') || acc.includes('accessible');
    club.is_all_ages = (club.tags_who || '').toLowerCase().includes('all ages');
    club.review_count = (club.testimonials || []).length;

    // Legacy fields for front-end compatibility
    club.monthly_fee = club.monthly_fee_amount;
    club.description = club.club_bio;
    club.rating = club.numeric_rating;
    club.user_rating = club.numeric_rating;
    club.total_members = club.member_count;
    club.age_groups = club.tags_who;
    club.skill_levels = 'All levels'; // not rendered on page
    club.tags = club.tags_array.join(', ');
    club.facilities = club.facilities_list;
    club.instructor_name = club.coach_name;
    club.instructor_bio = club.coach_role;
    club.featured = club.ranking_category === 'Featured' || false;

    // SEO helpers
    club.seo = generateSEOData(club);
    club.structured_data = generateStructuredData(club);

    return res.status(200).json(club);
  } catch (err) {
    console.error('Error in club-data API:', err);
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
  const club = {
    // Basic (A-C)
    club_id: safeGet(row, 0),
    club_name: safeGet(row, 1) || 'Unknown Club',
    active: safeGet(row, 2) || 'no',

    // URLs (D-E)
    page_url: safeGet(row, 3),
    booking_url: safeGet(row, 4),

    // Details (F-S)
    activity_type: safeGet(row, 5),
    // May contain emoji OR an image URL — front-end handles either
    club_logo_emoji: safeGet(row, 6),
    location: safeGet(row, 7),
    monthly_fee_amount: safeFloat(row, 8),
    monthly_fee_text: safeGet(row, 9),
    star_rating: safeGet(row, 10),       // out of 5 (display as stars)
    numeric_rating: safeFloat(row, 11),  // out of 10 (numeric)
    rating_out_of: safeFloat(row, 12) || 5,
    member_count: safeInt(row, 13),
    ranking_position: safeInt(row, 14),
    ranking_category: safeGet(row, 15),
    sessions_per_week: safeInt(row, 16),
    average_attendance: safeInt(row, 17),
    member_growth: safeGet(row, 18),

    // Sessions (T-AC: 19–30) — 4 sessions * (time, date, type)
    sessions: [],

    // Testimonials (AF-AN: 31–39) — 3 * (name, rating, text)
    testimonials: [],

    // Benefits (AO-BF: 40–57) — 6 * (icon, title, description)
    benefits: [],

    // Pricing (BG-BH: 58–59)
    pay_per_session_price: safeFloat(row, 58),
    savings_amount: safeFloat(row, 59),

    // FAQs (BI-BR: 60–69) — 5 * (q, a)
    faqs: [],

    // About & Coach (BS-BV: 70–73)
    club_bio: safeGet(row, 70),
    coach_name: safeGet(row, 71),
    coach_role: safeGet(row, 72),
    coach_avatar: safeGet(row, 73),

    // Facilities & Tags (BW-BZ: 74–77)
    facilities_list: safeGet(row, 74),
    tags_who: safeGet(row, 75),
    tags_vibe: safeGet(row, 76),
    tags_accessibility: safeGet(row, 77),

    // Contact (CA-CE: 78–82)
    email: safeGet(row, 78),
    phone: safeGet(row, 79),
    whatsapp: safeGet(row, 80),
    instagram: safeGet(row, 81),
    address: safeGet(row, 82),

    // Design (CF: 83)
    hero_background_gradient: safeGet(row, 83),

    // Image URL (CG: 84)
    image_url: safeGet(row, 84) || '',

    // Audience (CH: 85)
    audience: safeGet(row, 85) || '',

    // Review and Shop Links (CI-CJ: 86-87)
    review_link: safeGet(row, 86) || '',
    shop_link: safeGet(row, 87) || '',

    // Club Snippet (CL: 89) ← NEW FIELD ADDED HERE
    club_snippet: safeGet(row, 89) || '',
  };

  // Sessions: up to 4 rows (time, date, type)
  for (let i = 0; i < 4; i++) {
    const base = 19 + i * 3;
    const time = safeGet(row, base);
    const date = safeGet(row, base + 1);
    const type = safeGet(row, base + 2);
    if (time || date || type) club.sessions.push({ time, date, type });
  }

  // Testimonials: 3 blocks
  for (let i = 0; i < 3; i++) {
    const base = 31 + i * 3;
    const name = safeGet(row, base);
    const rating = safeFloat(row, base + 1);
    const text = safeGet(row, base + 2);
    if (name && text) club.testimonials.push({ author: name, rating, text });
  }

  // Benefits: 6 blocks
  for (let i = 0; i < 6; i++) {
    const base = 40 + i * 3;
    const icon = safeGet(row, base);
    const title = safeGet(row, base + 1);
    const description = safeGet(row, base + 2);
    if (title && description) club.benefits.push({ icon, title, description });
  }

  // FAQs: 5 pairs
  for (let i = 0; i < 5; i++) {
    const base = 60 + i * 2;
    const question = safeGet(row, base);
    const answer = safeGet(row, base + 1);
    if (question && answer) club.faqs.push({ question, answer });
  }

  return club;
}

function generateSEOData(c) {
  const title = [c.club_name, c.activity_type, c.location].filter(Boolean).join(' • ');
  const desc =
    c.club_bio ||
    `Join ${c.club_name || 'our club'} for ${c.activity_type || 'activities'} in ${c.location || 'your area'}.`;
  const image = c.image_url || '';
  return { title, description: desc, image };
}

function generateStructuredData(c) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsClub',
    name: c.club_name || '',
    description: c.club_bio || '',
    address: {
      '@type': 'PostalAddress',
      streetAddress: c.address || '',
      addressLocality: c.location || '',
    },
    telephone: c.phone || '',
    email: c.email || '',
    url: c.page_url || '',
    sameAs: (c.instagram ? [`https://instagram.com/${String(c.instagram).replace(/^@/, '')}`] : []),
    priceRange: c.monthly_fee_amount ? `£${c.monthly_fee_amount}/mo` : '',
  };
}
