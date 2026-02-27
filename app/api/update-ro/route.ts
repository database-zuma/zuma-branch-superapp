import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1i3Ji1Mxh65RwzQ4lp6lSWw0Axc6yeWtszbbf1FtAn_I';
const SHEET_NAME = 'roDatabase';

function getGoogleCredentials() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  
  if (!privateKey || !clientEmail) {
    throw new Error('Missing Google credentials. Set GOOGLE_PRIVATE_KEY and GOOGLE_CLIENT_EMAIL env vars.');
  }
  
  return {
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, '\n'),
  };
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const credentials = getGoogleCredentials();
    const { roId, articles } = await request.json();
    
    const jwtAuth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth: jwtAuth });
    
    // Get all data to find rows
    const getResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:I`,
    });
    
    const rows = getResponse.data.values || [];
    const updates = [];
    
    // Find and update each article
    for (const article of articles) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] === roId && row[2] === article.code) {
          const rowNumber = i + 1;
          updates.push({
            range: `${SHEET_NAME}!E${rowNumber}:G${rowNumber}`,
            values: [[article.ddd.toString(), article.ljbb.toString(), (article.ddd + article.ljbb).toString()]],
          });
        }
      }
    }
    
    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching rows found' }, { status: 404 });
    }
    
    // Batch update all changes
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });
    
    return NextResponse.json({ 
      success: true, 
      message: `Updated ${updates.length} articles`,
      updates: updates.length
    });
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating sheet:', error);
    return NextResponse.json({ 
      success: false, 
      error: message
    }, { status: 500 });
  }
}
