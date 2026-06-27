import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const configPath = path.join(process.cwd(), 'public', 'config.json')
    
    // Save updated configuration formatted nicely
    await fs.writeFile(configPath, JSON.stringify(body, null, 2), 'utf-8')
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error saving config:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
