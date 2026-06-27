import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export async function GET() {
  try {
    const dirPath = path.join(process.cwd(), 'public', 'images')
    
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true })
    
    const files = await fs.readdir(dirPath)
    
    // Filter for image file extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']
    const images = files
      .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
      .map(file => `/images/${file}`)

    return NextResponse.json({ images })
  } catch (error: any) {
    console.error('Error listing images:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
