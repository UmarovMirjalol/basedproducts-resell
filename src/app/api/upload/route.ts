import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Ensure public/images directory exists
    const dirPath = path.join(process.cwd(), 'public', 'images')
    await fs.mkdir(dirPath, { recursive: true })

    // Clean filename and make it unique
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filename = `${Date.now()}-${cleanName}`
    const filePath = path.join(dirPath, filename)

    await fs.writeFile(filePath, buffer)
    return NextResponse.json({ url: `/images/${filename}` })
  } catch (error: any) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const filename = searchParams.get('filename')
    if (!filename) {
      return NextResponse.json({ error: 'No filename provided' }, { status: 400 })
    }

    // Prevent path traversal
    const safeFilename = path.basename(filename)
    const filePath = path.join(process.cwd(), 'public', 'images', safeFilename)

    await fs.unlink(filePath)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting file:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
