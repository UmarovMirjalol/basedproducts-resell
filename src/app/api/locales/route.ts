import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export async function POST(req: Request) {
  try {
    const { lang, data } = await req.json()
    if (!lang || !data) {
      return NextResponse.json({ error: 'lang and data are required' }, { status: 400 })
    }

    // Ensure the filename is safe to prevent path traversal
    const safeLang = lang.replace(/[^a-z]/g, '')
    const localePath = path.join(process.cwd(), 'public', 'locales', `${safeLang}.json`)
    
    await fs.writeFile(localePath, JSON.stringify(data, null, 2), 'utf-8')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error saving locales:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
