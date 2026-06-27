'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Product {
  id: string
  price: number
  image: string
  category: string
  badge: string | null
  featured: boolean
}

interface Review {
  id: string
  name: string
  rating: number
}

interface Config {
  siteName: string
  telegramUrl: string
  currency: string
  categories: string[]
  products: Product[]
  reviews: Review[]
  faqIds: number[]
}

interface CartItem extends Product {
  quantity: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Ensures local image paths always start with a leading slash.
 * Accepts: 'based.jpg' → '/based.jpg', '/based.jpg' → '/based.jpg',
 *          'https://...' → unchanged, '' → ''
 */
function normalizeImageSrc(src: string): string {
  if (!src) return ''
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return src
  return '/' + src
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Page() {
  const [config, setConfig] = useState<Config | null>(null)
  const [lang, setLang] = useState('en')
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  // Admin Studio States
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const [adminTab, setAdminTab] = useState<'catalog' | 'gallery'>('catalog')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [localesData, setLocalesData] = useState<Record<string, Record<string, string>>>({
    en: {},
    ru: {},
    uz: {}
  })

  // Load locales on admin open
  useEffect(() => {
    if (isAdminOpen) {
      Promise.all([
        fetch('/locales/en.json').then((r) => r.json()),
        fetch('/locales/ru.json').then((r) => r.json()),
        fetch('/locales/uz.json').then((r) => r.json()),
      ])
        .then(([en, ru, uz]) => {
          setLocalesData({ en, ru, uz })
        })
        .catch(console.error)
      
      fetchGalleryImages()
    }
  }, [isAdminOpen])

  const fetchGalleryImages = async () => {
    try {
      const res = await fetch('/api/images')
      if (res.ok) {
        const data = await res.json()
        setGalleryImages(data.images || [])
      }
    } catch (e) {
      console.error('Error fetching gallery images:', e)
    }
  }

  const saveCatalog = async (updatedConfig: Config, updatedLocales: Record<string, Record<string, string>>) => {
    setIsSaving(true)
    try {
      // 1. Save config.json
      const configRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      })
      if (!configRes.ok) throw new Error('Failed to save configuration file')

      // 2. Save all locales files
      for (const l of ['en', 'ru', 'uz']) {
        const localeRes = await fetch('/api/locales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lang: l, data: updatedLocales[l] }),
        })
        if (!localeRes.ok) throw new Error(`Failed to save locale ${l}`)
      }

      setConfig(updatedConfig)
      setLocalesData(updatedLocales)
      setTranslations(updatedLocales[lang])
      showToast('Catalog & translation files saved successfully ✓')
    } catch (error: any) {
      console.error('Error saving catalog:', error)
      showToast(`Save failed: ${error.message || error} ⨯`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleImageUpload = async (file: File, productId?: string) => {
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      const imageUrl = data.url
      
      await fetchGalleryImages()

      if (productId && config) {
        const updatedProducts = config.products.map((p) => 
          p.id === productId ? { ...p, image: imageUrl } : p
        )
        const updatedConfig = { ...config, products: updatedProducts }
        await saveCatalog(updatedConfig, localesData)
        showToast('Image uploaded and assigned ✓')
      } else {
        showToast('Image uploaded to library ✓')
      }
    } catch (e: any) {
      console.error(e)
      showToast('Upload failed ⨯')
    } finally {
      setIsUploading(false)
    }
  }

  const handleImageDelete = async (imageUrl: string) => {
    const filename = imageUrl.replace('/images/', '')
    if (!confirm(`Are you sure you want to delete ${filename} from the server?`)) return

    try {
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete image file')
      
      await fetchGalleryImages()
      showToast('Image file deleted ✓')

      if (config) {
        let changed = false
        const updatedProducts = config.products.map((p) => {
          if (p.image === imageUrl) {
            changed = true
            return { ...p, image: '' }
          }
          return p
        })
        if (changed) {
          await saveCatalog({ ...config, products: updatedProducts }, localesData)
        }
      }
    } catch (e: any) {
      console.error(e)
      showToast('Delete failed ⨯')
    }
  }

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [badgeTrigger, setBadgeTrigger] = useState(0)

  // Catalog state
  const [activeCategory, setActiveCategory] = useState('all')

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Load config & initial theme/lang
  useEffect(() => {
    fetch('/config.json')
      .then((r) => r.json())
      .then(setConfig)

    // Lang
    const savedLang = localStorage.getItem('fc_lang') || 'en'
    setLang(savedLang)

    // Theme
    const savedTheme = (localStorage.getItem('fc_theme') as 'dark' | 'light') || 'dark'
    setTheme(savedTheme)
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }

    // Cart
    const savedCart = localStorage.getItem('fc_cart')
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart))
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  // Load translations when language changes
  useEffect(() => {
    fetch(`/locales/${lang}.json`)
      .then((r) => r.json())
      .then(setTranslations)
    localStorage.setItem('fc_lang', lang)
  }, [lang])

  // Save cart to local storage
  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart)
    localStorage.setItem('fc_cart', JSON.stringify(newCart))
  }

  // Translate function
  const t = useCallback((key: string): string => {
    return translations[key] || key
  }, [translations])

  // Handle Theme Toggle
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('fc_theme', nextTheme)
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }

  // Cart operations
  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.id === product.id)
    if (existing) {
      saveCart(cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
    } else {
      saveCart([...cart, { ...product, quantity: 1 }])
    }
    // Bounce badge & show toast
    setBadgeTrigger(v => v + 1)
    showToast(`${t(`product.${product.id}.name`)} ${t('cart.add')} ✓`)
  }

  const updateQuantity = (productId: string, delta: number) => {
    const updated = cart.map((item) => {
      if (item.id === productId) {
        const nextQty = item.quantity + delta
        return nextQty > 0 ? { ...item, quantity: nextQty } : null
      }
      return item
    }).filter(Boolean) as CartItem[]
    saveCart(updated)
    setBadgeTrigger(v => v + 1)
  }

  const removeFromCart = (productId: string) => {
    saveCart(cart.filter((item) => item.id !== productId))
    setBadgeTrigger(v => v + 1)
  }

  const clearCart = () => {
    saveCart([])
    setBadgeTrigger(v => v + 1)
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 2500)
  }

  // Telegram Checkout handler
  const handleCheckout = () => {
    if (!config) return

    let orderText = `${t('order.greeting')}\n\n`
    cart.forEach((item) => {
      orderText += `- ${t(`product.${item.id}.name`)} x${item.quantity}\n`
    })

    // Copy to clipboard
    navigator.clipboard.writeText(orderText).then(() => {
      showToast(t('cart.copied'))
      setTimeout(() => {
        const url = `${config.telegramUrl}?text=${encodeURIComponent(orderText)}`
        window.open(url, '_blank')
      }, 1000)
    })
  }

  if (!config || !translations['nav.shop']) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const featuredProducts = config.products.filter((p) => p.featured)
  const filteredProducts = activeCategory === 'all' 
    ? config.products 
    : config.products.filter((p) => p.category === activeCategory)

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0)
  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0)

  return (
    <div className="min-h-screen bg-bg-base text-text-base transition-colors duration-500 overflow-x-hidden">
      
      {/* ─── TOAST NOTIFICATION ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-50 bg-text-base text-bg-base px-6 py-3 rounded-sm shadow-xl text-xs font-bold tracking-wider uppercase border border-border-base"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── NAVIGATION ──────────────────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 top-0 z-40 bg-bg-base/80 backdrop-blur-md border-b border-border-base transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-5 md:px-10 h-16 flex items-center justify-between">
          <span 
            style={{ fontFamily: 'var(--font-display)' }} 
            className="text-2xl font-normal tracking-wide cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            {config.siteName}
          </span>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <button onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-accent transition-colors">
              {t('nav.shop')}
            </button>
            <button onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-accent transition-colors">
              {t('nav.about')}
            </button>
            <button onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-accent transition-colors">
              {t('nav.reviews')}
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme} 
              className="p-2 hover:bg-bg-surface rounded-sm transition-colors text-text-muted hover:text-text-base" 
              aria-label="Toggle Theme"
            >
              <motion.div
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                )}
              </motion.div>
            </motion.button>

            {/* Language Switch */}
            <div className="flex items-center gap-1 bg-bg-surface p-1 rounded-sm border border-border-base">
              {['en', 'ru', 'uz'].map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-xs transition-all uppercase ${
                    lang === l ? 'bg-text-base text-bg-base' : 'text-text-muted hover:text-text-base'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Cart Icon */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 hover:bg-bg-surface rounded-sm transition-colors text-text-muted hover:text-text-base"
              aria-label="Open Cart"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <AnimatePresence>
                {cartCount > 0 && (
                  <motion.span
                    key={badgeTrigger}
                    initial={{ scale: 0.5 }}
                    animate={{ scale: [1, 1.4, 1] }}
                    className="absolute top-0 right-0 w-4 h-4 bg-accent text-bg-base text-[9px] font-bold rounded-full flex items-center justify-center"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center text-center px-5 pt-16">
        <div className="absolute inset-0 bg-gradient-to-b from-bg-surface/50 to-bg-base -z-10 transition-colors duration-300" />
        <div className="max-w-4xl mx-auto">
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-xs tracking-[0.4em] uppercase text-accent mb-6 font-semibold"
          >
            {t('hero.tag')}
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            style={{ fontFamily: 'var(--font-display)' }} 
            className="text-6xl md:text-8xl lg:text-9xl font-light leading-none tracking-tight mb-8"
          >
            {t('hero.h1a')}<br />
            <span className="italic text-accent">{t('hero.h1b')}</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.35 }}
            className="text-text-muted text-base md:text-lg max-w-md mx-auto mb-12 font-light leading-relaxed"
          >
            {t('hero.sub')}
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-10 py-4 bg-text-base text-bg-base font-semibold tracking-wider uppercase text-xs hover:opacity-90 transition-all rounded-sm shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {t('hero.cta')}
            </button>
            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-10 py-4 border border-border-base text-text-base font-semibold tracking-wider uppercase text-xs hover:bg-bg-surface transition-all rounded-sm text-center transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {t('hero.cta2')}
            </a>
          </motion.div>
        </div>
      </section>

      {/* ─── MARQUEE ──────────────────────────────────────────────────────────── */}
      <div className="border-y border-border-base bg-bg-surface py-4 overflow-hidden transition-colors duration-300">
        <div className="marquee-inner flex w-max">
          {[0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5].map((index, i) => (
            <span key={i} className="text-[10px] tracking-[0.35em] uppercase text-text-muted whitespace-nowrap px-8 font-medium">
              {t(`marquee.${index}`)}
              <span className="ml-8 text-accent">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ─── FEATURED PRODUCTS ───────────────────────────────────────────────── */}
      <section className="py-28 px-5 md:px-10 max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[10px] tracking-[0.45em] uppercase text-text-muted mb-4">{t('section.featured.tag')}</p>
          <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl md:text-5xl font-light">{t('section.featured.h2')}</h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredProducts.map((p, i) => (
            <ProductCardComponent key={p.id} product={p} currency={config.currency} onAdd={addToCart} t={t} delay={i + 1} />
          ))}
        </div>
      </section>

      {/* ─── CATEGORIES ───────────────────────────────────────────────────────── */}
      <section id="shop" className="py-20 bg-bg-surface border-y border-border-base transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-5 md:px-10 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <p className="text-[10px] tracking-[0.45em] uppercase text-text-muted mb-4">{t('section.categories.tag')}</p>
            <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl md:text-5xl font-light">{t('section.categories.h2')}</h2>
          </motion.div>
          <div className="flex flex-wrap justify-center gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveCategory('all')}
              className={`px-6 py-3 text-xs tracking-wider uppercase font-semibold rounded-sm transition-all ${
                activeCategory === 'all'
                  ? 'bg-accent text-bg-base shadow-md'
                  : 'border border-border-base text-text-muted hover:border-text-base hover:text-text-base bg-bg-base'
              }`}
            >
              {t('category.all')}
            </motion.button>
            {config.categories.map((cat, i) => (
              <motion.button
                whileTap={{ scale: 0.95 }}
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-3 text-xs tracking-wider uppercase font-semibold rounded-sm transition-all ${
                  activeCategory === cat
                    ? 'bg-accent text-bg-base shadow-md'
                    : 'border border-border-base text-text-muted hover:border-text-base hover:text-text-base bg-bg-base'
                }`}
              >
                {t(`category.${cat}`)}
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CATALOG ──────────────────────────────────────────────────────────── */}
      <section className="py-28 px-5 md:px-10 max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[10px] tracking-[0.45em] uppercase text-text-muted mb-4">{t('section.catalog.tag')}</p>
          <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl md:text-5xl font-light">{t('section.catalog.h2')}</h2>
        </motion.div>
        
        {/* Animated layout layout for filtered catalog grid */}
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((p, i) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
                key={p.id}
              >
                <ProductCardComponent product={p} currency={config.currency} onAdd={addToCart} t={t} delay={0} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* ─── PHILOSOPHY ──────────────────────────────────────────────────────── */}
      <section id="about" className="py-28 bg-bg-surface border-y border-border-base transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-5 md:px-10 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-[10px] tracking-[0.45em] uppercase text-accent mb-6 font-semibold">{t('section.about.tag')}</p>
            <h2 
              style={{ fontFamily: 'var(--font-display)' }} 
              className="text-4xl md:text-5xl font-light leading-tight mb-8"
            >
              {t('section.about.h2')}
            </h2>
            <p className="text-text-muted text-base font-light leading-relaxed mb-10">
              {t('section.about.body')}
            </p>
            <a 
              href={config.telegramUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center text-text-base text-sm font-semibold border-b-2 border-accent pb-1 hover:text-accent transition-colors"
            >
              {t('section.about.cta')}
            </a>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="grid grid-cols-3 gap-px bg-border-base overflow-hidden rounded-sm"
          >
            {[1, 2, 3].map((num) => (
              <div key={num} className="bg-bg-base p-8 text-center transition-colors duration-300">
                <p style={{ fontFamily: 'var(--font-display)' }} className="text-3xl font-light text-accent mb-2">
                  {t(`section.about.stat${num}v`)}
                </p>
                <p className="text-[9px] tracking-[0.25em] uppercase text-text-muted font-medium">
                  {t(`section.about.stat${num}l`)}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── REVIEWS ──────────────────────────────────────────────────────────── */}
      <section id="reviews" className="py-28 px-5 md:px-10 max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[10px] tracking-[0.45em] uppercase text-text-muted mb-4">{t('section.reviews.tag')}</p>
          <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl md:text-5xl font-light">{t('section.reviews.h2')}</h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.reviews.map((r, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              key={r.id} 
              className="bg-bg-surface border border-border-base p-8 rounded-sm transition-colors duration-300"
            >
              <div className="flex gap-0.5 mb-5 text-[#c9a96e]">
                {Array.from({ length: r.rating }).map((_, starIndex) => (
                  <svg key={starIndex} className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p style={{ fontFamily: 'var(--font-display)' }} className="text-text-base text-lg font-light leading-relaxed mb-6 italic">
                "{t(`review.${r.id}.text`)}"
              </p>
              <p className="text-text-muted text-xs font-semibold tracking-wider uppercase">{r.name}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────────────── */}
      <section className="py-28 bg-bg-surface border-y border-border-base transition-colors duration-300">
        <div className="max-w-3xl mx-auto px-5 md:px-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-[10px] tracking-[0.45em] uppercase text-text-muted mb-4">{t('section.faq.tag')}</p>
            <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl md:text-5xl font-light">{t('section.faq.h2')}</h2>
          </motion.div>
          <div className="divide-y divide-border-base border-t border-b border-border-base">
            {config.faqIds.map((id) => (
              <div key={id} className="py-2">
                <button
                  onClick={() => setOpenFaq(openFaq === id ? null : id)}
                  className="w-full text-left py-5 flex items-center justify-between gap-4 group"
                >
                  <span className="text-sm md:text-base font-medium text-text-base group-hover:text-accent transition-colors">
                    {t(`faq.${id}.q`)}
                  </span>
                  <motion.span 
                    animate={{ rotate: openFaq === id ? 45 : 0 }}
                    className="text-accent text-2xl font-light shrink-0"
                  >
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="pb-5 pr-8">
                        <p className="text-text-muted text-sm leading-relaxed">{t(`faq.${id}.a`)}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NEWSLETTER ──────────────────────────────────────────────────────── */}
      <section className="py-24 px-5">
        <NewsletterComponent t={t} />
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border-base bg-bg-surface py-16 px-5 md:px-10 transition-colors duration-300">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          <div>
            <span style={{ fontFamily: 'var(--font-display)' }} className="text-2xl block mb-4">
              {config.siteName}
            </span>
            <p className="text-text-muted text-xs leading-relaxed max-w-xs">
              {t('footer.tagline')}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-text-muted mb-4">Navigate</p>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })} className="text-left text-text-muted text-xs hover:text-text-base transition-colors font-medium">
                {t('nav.shop')}
              </button>
              <button onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })} className="text-left text-text-muted text-xs hover:text-text-base transition-colors font-medium">
                {t('nav.about')}
              </button>
              <button onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })} className="text-left text-text-muted text-xs hover:text-text-base transition-colors font-medium">
                {t('nav.reviews')}
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-text-muted mb-4">Order</p>
            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted text-xs hover:text-accent transition-colors font-semibold flex items-center gap-1"
            >
              {t('footer.order')} <span className="text-accent">→</span>
            </a>
          </div>
        </div>
        <div className="border-t border-border-base pt-8 flex flex-col sm:flex-row justify-between gap-4">
          <p className="text-text-muted text-[11px] font-medium">
            © {new Date().getFullYear()} {config.siteName}. {t('footer.rights')}.
          </p>
        </div>
      </footer>

      {/* ─── CART DRAWER ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setIsCartOpen(false)} 
            />
            
            {/* Panel */}
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-md bg-bg-base border-l border-border-base shadow-2xl flex flex-col transition-colors duration-300"
              >
                <div className="p-6 border-b border-border-base flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-wide">{t('cart.title')}</h2>
                  <button onClick={() => setIsCartOpen(false)} className="text-text-muted hover:text-text-base">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <AnimatePresence mode="popLayout">
                    {cart.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex flex-col items-center justify-center text-center"
                      >
                        <p className="text-text-muted text-sm font-semibold tracking-wide mb-1">{t('cart.empty')}</p>
                        <p className="text-text-muted/60 text-xs">{t('cart.emptySub')}</p>
                        <button
                          onClick={() => setIsCartOpen(false)}
                          className="mt-6 px-6 py-2.5 border border-border-base text-text-base text-xs font-semibold uppercase tracking-wider rounded-sm hover:bg-bg-surface transition-colors"
                        >
                          {t('cart.continueShopping')}
                        </button>
                      </motion.div>
                    ) : (
                      cart.map((item) => (
                        <motion.div 
                          layout
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.3 }}
                          key={item.id} 
                          className="flex gap-4"
                        >
                          <div className="relative w-20 h-24 bg-bg-surface border border-border-base rounded-sm overflow-hidden flex-shrink-0">
                            {item.image ? (
                              <Image src={normalizeImageSrc(item.image)} alt={t(`product.${item.id}.name`)} fill className="object-cover" sizes="80px" />
                            ) : (
                              <PlaceholderImage />
                            )}
                          </div>
                          <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-start">
                              <h3 className="text-sm font-semibold text-text-base leading-snug">{t(`product.${item.id}.name`)}</h3>
                              <button onClick={() => removeFromCart(item.id)} className="text-text-muted hover:text-red-500 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <p className="text-accent text-xs font-semibold mt-1">
                              {config.currency}{item.price}
                            </p>
                            <div className="flex items-center gap-3 mt-auto pt-2">
                              <span className="text-text-muted text-[10px] uppercase font-semibold tracking-wider">
                                {t('cart.qty')}
                              </span>
                              <div className="flex items-center border border-border-base rounded-sm bg-bg-surface">
                                <button 
                                  onClick={() => updateQuantity(item.id, -1)} 
                                  className="px-2.5 py-1 text-xs hover:text-accent font-semibold transition-colors"
                                >
                                  -
                                </button>
                                <span className="text-xs font-semibold px-2 w-6 text-center">{item.quantity}</span>
                                <button 
                                  onClick={() => updateQuantity(item.id, 1)} 
                                  className="px-2.5 py-1 text-xs hover:text-accent font-semibold transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>

                {cart.length > 0 && (
                  <div className="p-6 border-t border-border-base bg-bg-surface space-y-4">
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span className="text-text-muted uppercase tracking-wider">{t('cart.total')}</span>
                      <span className="text-lg text-text-base">{config.currency}{cartTotal.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={handleCheckout}
                      className="w-full py-4 bg-accent text-bg-base text-xs font-bold tracking-widest uppercase hover:opacity-90 transition-opacity rounded-sm shadow-md"
                    >
                      {t('cart.buy')}
                    </button>
                    <button
                      onClick={clearCart}
                      className="w-full py-2.5 text-text-muted hover:text-text-base text-xs font-semibold tracking-wider uppercase transition-colors"
                    >
                      {t('cart.clear')}
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── FLOATING ADMIN TRIGGER ───────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsAdminOpen(true)}
          className="w-12 h-12 bg-accent text-bg-base rounded-full flex items-center justify-center shadow-2xl border border-accent/20 hover:border-accent/40 transition-colors cursor-pointer group"
          aria-label="Open Catalog Studio"
        >
          <svg className="w-5 h-5 group-hover:rotate-45 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </motion.button>
      </div>

      {/* ─── CATALOG STUDIO (ADMIN OVERLAY DRAWER) ────────────────────────────── */}
      <AnimatePresence>
        {isAdminOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden text-text-base">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setIsAdminOpen(false)}
            />

            {/* Panel container */}
            <div className="absolute inset-y-0 right-0 max-w-full flex">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 200 }}
                className="w-screen max-w-3xl bg-bg-base border-l border-border-base shadow-2xl flex flex-col h-full"
              >
                {/* Header */}
                <div className="p-6 border-b border-border-base flex items-center justify-between bg-bg-surface">
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-2xl font-normal text-accent tracking-wide">
                      Catalog Studio
                    </h2>
                    <p className="text-[10px] text-text-muted uppercase tracking-[0.2em] mt-1">
                      Manage Products & Store Images
                    </p>
                  </div>
                  <button onClick={() => setIsAdminOpen(false)} className="p-2 hover:bg-bg-base rounded-full text-text-muted hover:text-text-base transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border-base bg-bg-surface/50 text-xs uppercase font-bold tracking-wider">
                  <button
                    onClick={() => { setAdminTab('catalog'); setSelectedProductId(null); }}
                    className={`flex-1 py-4 text-center border-b-2 transition-all ${
                      adminTab === 'catalog'
                        ? 'border-accent text-accent bg-bg-base/30'
                        : 'border-transparent text-text-muted hover:text-text-base'
                    }`}
                  >
                    Product Catalogue
                  </button>
                  <button
                    onClick={() => setAdminTab('gallery')}
                    className={`flex-1 py-4 text-center border-b-2 transition-all ${
                      adminTab === 'gallery'
                        ? 'border-accent text-accent bg-bg-base/30'
                        : 'border-transparent text-text-muted hover:text-text-base'
                    }`}
                  >
                    Image Library ({galleryImages.length})
                  </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {adminTab === 'catalog' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full items-start">
                      {/* Left: Product List */}
                      <div className="space-y-4 border-r border-border-base/50 pr-0 md:pr-6">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="text-xs uppercase tracking-widest text-text-muted font-bold">Products List</h3>
                          <button
                            onClick={() => {
                              const newId = `product-${Date.now()}`
                              const newProduct: Product = {
                                id: newId,
                                price: 20,
                                image: '',
                                category: config.categories[0] || 'all',
                                badge: null,
                                featured: false
                              }
                              
                              // Create locale keys
                              const updatedLocales = { ...localesData }
                              for (const langKey of ['en', 'ru', 'uz']) {
                                updatedLocales[langKey] = {
                                  ...updatedLocales[langKey],
                                  [`product.${newId}.name`]: 'New Product',
                                  [`product.${newId}.desc`]: 'Description of the product.'
                                }
                              }

                              const updatedConfig = {
                                ...config,
                                products: [...config.products, newProduct]
                              }
                              saveCatalog(updatedConfig, updatedLocales)
                              setSelectedProductId(newId)
                            }}
                            className="text-xs font-semibold uppercase tracking-wider text-accent border border-accent/20 px-3 py-1.5 rounded-sm hover:bg-accent hover:text-bg-base transition-all flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Add Product
                          </button>
                        </div>

                        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 scrollbar-thin">
                          {config.products.map((p) => {
                            const isSelected = selectedProductId === p.id
                            return (
                              <div
                                key={p.id}
                                onClick={() => setSelectedProductId(p.id)}
                                className={`flex items-center gap-3 p-3 rounded-sm border transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-bg-surface border-accent'
                                    : 'bg-bg-surface/30 border-border-base hover:border-border-base/80'
                                }`}
                              >
                                <div className="relative w-10 h-12 bg-bg-surface rounded-xs overflow-hidden flex-shrink-0 border border-border-base">
                                  {p.image ? (
                                    <Image src={normalizeImageSrc(p.image)} alt="" fill className="object-cover" sizes="40px" />
                                  ) : (
                                    <PlaceholderImage />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-xs font-semibold truncate">{localesData[lang][`product.${p.id}.name`] || p.id}</h4>
                                  <p className="text-[10px] text-text-muted uppercase mt-0.5">{p.category} · {config.currency}{p.price}</p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!confirm(`Are you sure you want to delete ${localesData[lang][`product.${p.id}.name`] || p.id}?`)) return
                                    
                                    // Remove translations
                                    const updatedLocales = { ...localesData }
                                    for (const langKey of ['en', 'ru', 'uz']) {
                                      const cleanLoc = { ...updatedLocales[langKey] }
                                      delete cleanLoc[`product.${p.id}.name`]
                                      delete cleanLoc[`product.${p.id}.desc`]
                                      updatedLocales[langKey] = cleanLoc
                                    }

                                    const updatedConfig = {
                                      ...config,
                                      products: config.products.filter((prod) => prod.id !== p.id)
                                    }
                                    saveCatalog(updatedConfig, updatedLocales)
                                    if (selectedProductId === p.id) {
                                      setSelectedProductId(null)
                                    }
                                  }}
                                  className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-sm transition-all"
                                  title="Delete Product"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Right: Product Editor */}
                      <div>
                        {selectedProductId ? (
                          (() => {
                            const product = config.products.find((p) => p.id === selectedProductId)
                            if (!product) return null
                            return (
                              <div className="space-y-5 bg-bg-surface/30 border border-border-base p-5 rounded-sm">
                                <h3 className="text-xs uppercase tracking-widest text-accent font-bold mb-2">Edit Product details</h3>

                                <div>
                                  <label className="block text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Product ID (Unique Key)</label>
                                  <input
                                    type="text"
                                    value={product.id}
                                    disabled
                                    className="w-full bg-bg-surface border border-border-base/80 px-3 py-2 text-xs rounded-sm opacity-50 outline-none"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Price ({config.currency})</label>
                                    <input
                                      type="number"
                                      value={product.price}
                                      onChange={(e) => {
                                        const updated = config.products.map((p) =>
                                          p.id === product.id ? { ...p, price: Number(e.target.value) } : p
                                        )
                                        saveCatalog({ ...config, products: updated }, localesData)
                                      }}
                                      className="w-full bg-bg-surface border border-border-base px-3 py-2 text-xs rounded-sm outline-none focus:border-accent text-text-base transition-colors"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Category</label>
                                    <select
                                      value={product.category}
                                      onChange={(e) => {
                                        const updated = config.products.map((p) =>
                                          p.id === product.id ? { ...p, category: e.target.value } : p
                                        )
                                        saveCatalog({ ...config, products: updated }, localesData)
                                      }}
                                      className="w-full bg-bg-surface border border-border-base px-3 py-2 text-xs rounded-sm outline-none focus:border-accent text-text-base transition-colors"
                                    >
                                      {config.categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                          {t(`category.${cat}`)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Product Title (English)</label>
                                  <input
                                    type="text"
                                    value={localesData.en[`product.${product.id}.name`] || ''}
                                    onChange={(e) => {
                                      const updatedLocales = { ...localesData }
                                      updatedLocales.en[`product.${product.id}.name`] = e.target.value
                                      saveCatalog(config, updatedLocales)
                                    }}
                                    className="w-full bg-bg-surface border border-border-base px-3 py-2 text-xs rounded-sm outline-none focus:border-accent text-text-base transition-colors"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Product Description (English)</label>
                                  <textarea
                                    value={localesData.en[`product.${product.id}.desc`] || ''}
                                    rows={2}
                                    onChange={(e) => {
                                      const updatedLocales = { ...localesData }
                                      updatedLocales.en[`product.${product.id}.desc`] = e.target.value
                                      saveCatalog(config, updatedLocales)
                                    }}
                                    className="w-full bg-bg-surface border border-border-base px-3 py-2 text-xs rounded-sm outline-none focus:border-accent text-text-base transition-colors resize-none text-text-base"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-4 items-center">
                                  <div>
                                    <label className="block text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Badge</label>
                                    <select
                                      value={product.badge || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? null : e.target.value
                                        const updated = config.products.map((p) =>
                                          p.id === product.id ? { ...p, badge: val } : p
                                        )
                                        saveCatalog({ ...config, products: updated }, localesData)
                                      }}
                                      className="w-full bg-bg-surface border border-border-base px-3 py-2 text-xs rounded-sm outline-none focus:border-accent text-text-base transition-colors"
                                    >
                                      <option value="">No Badge</option>
                                      <option value="bestSeller">Best Seller</option>
                                      <option value="newArrival">New</option>
                                      <option value="save20">Save 20%</option>
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-2 pt-5">
                                    <input
                                      type="checkbox"
                                      id="chk-featured"
                                      checked={product.featured}
                                      onChange={(e) => {
                                        const updated = config.products.map((p) =>
                                          p.id === product.id ? { ...p, featured: e.target.checked } : p
                                        )
                                        saveCatalog({ ...config, products: updated }, localesData)
                                      }}
                                      className="w-4 h-4 accent-accent rounded-sm border-border-base bg-bg-surface"
                                    />
                                    <label htmlFor="chk-featured" className="text-xs font-semibold text-text-muted hover:text-text-base transition-colors cursor-pointer select-none">
                                      Featured Product
                                    </label>
                                  </div>
                                </div>

                                <div className="border-t border-border-base/50 pt-4 space-y-4">
                                  <label className="block text-[10px] text-text-muted uppercase tracking-wider font-semibold">Product Image Manager</label>
                                  
                                  {/* Current Image Preview */}
                                  <div className="flex items-center gap-4">
                                    <div className="relative w-20 h-24 bg-bg-surface rounded-sm overflow-hidden border border-border-base flex-shrink-0">
                                      {product.image ? (
                                        <Image src={normalizeImageSrc(product.image)} alt="" fill className="object-cover" sizes="80px" />
                                      ) : (
                                        <PlaceholderImage />
                                      )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                      <div className="text-[10px] text-text-muted truncate max-w-[200px]" title={product.image || 'No image linked'}>
                                        {product.image ? `Path: ${product.image}` : 'No image assigned'}
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => {
                                            const updated = config.products.map((p) =>
                                              p.id === product.id ? { ...p, image: '' } : p
                                            )
                                            saveCatalog({ ...config, products: updated }, localesData)
                                          }}
                                          disabled={!product.image}
                                          className="text-[10px] px-2.5 py-1.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-red-500 transition-all font-semibold uppercase tracking-wider rounded-xs cursor-pointer"
                                        >
                                          Remove Image
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Image Setup Options */}
                                  <div className="space-y-3">
                                    {/* Upload Target */}
                                    <div className="bg-bg-surface/50 border border-dashed border-border-base p-4 rounded-sm text-center relative group hover:border-accent/40 transition-colors">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        id="file-upload-editor"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0]
                                          if (file) handleImageUpload(file, product.id)
                                        }}
                                        disabled={isUploading}
                                      />
                                      {isUploading ? (
                                        <div className="flex flex-col items-center justify-center py-2">
                                          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mb-1.5" />
                                          <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Uploading file...</span>
                                        </div>
                                      ) : (
                                        <div className="py-2">
                                          <svg className="w-5 h-5 text-text-muted group-hover:text-accent mx-auto mb-1.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                                          </svg>
                                          <span className="text-[10px] font-bold text-text-muted group-hover:text-text-base transition-colors uppercase tracking-wider block">Upload local file</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* External URL */}
                                    <div>
                                      <span className="block text-[9px] uppercase tracking-wider text-text-muted font-bold mb-1">Or paste external image URL</span>
                                      <input
                                        type="text"
                                        placeholder="https://example.com/image.jpg"
                                        value={product.image.startsWith('http') ? product.image : ''}
                                        onChange={(e) => {
                                          const updated = config.products.map((p) =>
                                            p.id === product.id ? { ...p, image: e.target.value } : p
                                          )
                                          saveCatalog({ ...config, products: updated }, localesData)
                                        }}
                                        className="w-full bg-bg-surface border border-border-base px-3 py-2 text-xs rounded-sm outline-none focus:border-accent text-text-base transition-colors placeholder:text-text-muted/30"
                                      />
                                    </div>

                                    {/* Library Selection */}
                                    <div>
                                      <span className="block text-[9px] uppercase tracking-wider text-text-muted font-bold mb-1.5">Or choose from Uploaded Library</span>
                                      <div className="grid grid-cols-5 gap-1.5 max-h-[120px] overflow-y-auto border border-border-base p-2 rounded-sm bg-bg-surface/10">
                                        {galleryImages.map((img) => (
                                          <div
                                            key={img}
                                            onClick={() => {
                                              const updated = config.products.map((p) =>
                                                p.id === product.id ? { ...p, image: img } : p
                                              )
                                              saveCatalog({ ...config, products: updated }, localesData)
                                            }}
                                            className={`relative aspect-square cursor-pointer rounded-xs overflow-hidden border ${
                                              product.image === img ? 'border-accent ring-1 ring-accent' : 'border-border-base hover:border-text-muted'
                                            }`}
                                          >
                                            <Image src={img} alt="" fill className="object-cover" sizes="40px" />
                                          </div>
                                        ))}
                                        {galleryImages.length === 0 && (
                                          <div className="col-span-5 text-center py-4 text-[10px] text-text-muted/60">
                                            No uploaded images.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })()
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-bg-surface/10 border border-border-base border-dashed rounded-sm">
                            <svg className="w-8 h-8 text-text-muted/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">No Product Selected</h4>
                            <p className="text-[10px] text-text-muted/60 max-w-[200px] leading-relaxed">Select a product from the left catalogue list to edit its details and manage its images.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Tab: Gallery Library */
                    <div className="space-y-6">
                      {/* Drag & Drop upload area */}
                      <div className="bg-bg-surface/30 border-2 border-dashed border-border-base rounded-sm p-8 text-center relative group hover:border-accent transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || [])
                            files.forEach((file) => handleImageUpload(file))
                          }}
                          disabled={isUploading}
                        />
                        {isUploading ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
                            <p className="text-xs font-bold text-accent uppercase tracking-wider">Uploading files to library...</p>
                          </div>
                        ) : (
                          <div>
                            <svg className="w-8 h-8 text-text-muted/50 group-hover:text-accent mx-auto mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.25 13.5h3.86a2.25 2.25 0 012.008 1.24l.885 1.77a2.25 2.25 0 002.007 1.24h1.98a2.25 2.25 0 002.007-1.24l.885-1.77a2.25 2.25 0 012.007-1.24h3.86m-18 0h18M2.25 9l.223-1.95A4.5 4.5 0 016.945 3h10.11a4.5 4.5 0 014.472 4.05L21.75 9m-19.5 0v8.25A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V9m-18 0l.885 1.77a2.25 2.25 0 002.007 1.24h1.98a2.25 2.25 0 002.007-1.24L12.75 9" />
                            </svg>
                            <p className="text-xs font-bold text-text-muted group-hover:text-text-base transition-colors uppercase tracking-widest mb-1">Drag & Drop files or click to upload</p>
                            <p className="text-[10px] text-text-muted/60">Supports JPEG, PNG, WEBP, SVG</p>
                          </div>
                        )}
                      </div>

                      {/* Image library list */}
                      <div className="space-y-3">
                        <h3 className="text-xs uppercase tracking-widest text-text-muted font-bold">Uploaded Assets Library</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                          {galleryImages.map((img) => (
                            <div
                              key={img}
                              className="group relative bg-bg-surface border border-border-base rounded-sm overflow-hidden aspect-square flex flex-col hover:border-accent/40 hover:shadow-md transition-all"
                            >
                              <div className="relative flex-1 bg-bg-surface/20">
                                <Image src={img} alt="" fill className="object-cover" sizes="(max-width: 640px) 45vw, 15vw" />
                              </div>
                              
                              {/* Hover actions */}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity duration-300">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(img)
                                    showToast('URL copied to clipboard ✓')
                                  }}
                                  className="p-2 bg-bg-base/80 hover:bg-accent hover:text-bg-base rounded-sm transition-all text-text-base"
                                  title="Copy URL Path"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleImageDelete(img)}
                                  className="p-2 bg-bg-base/80 hover:bg-red-500 hover:text-white rounded-sm transition-all text-text-base"
                                  title="Delete from server"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                              <div className="p-2 bg-bg-surface border-t border-border-base">
                                <p className="text-[9px] text-text-muted truncate select-all">{img.replace('/images/', '')}</p>
                              </div>
                            </div>
                          ))}

                          {galleryImages.length === 0 && (
                            <div className="col-span-full text-center py-12 border border-border-base border-dashed rounded-sm bg-bg-surface/10 text-text-muted/60 text-xs">
                              The media library is empty. Upload some assets using the drop zone above.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer status */}
                <div className="p-4 border-t border-border-base bg-bg-surface flex justify-between items-center text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  <span>Configuration Auto-syncs</span>
                  {isSaving ? (
                    <span className="text-accent animate-pulse">Syncing on server...</span>
                  ) : (
                    <span className="text-emerald-500">Synced to Disk ✓</span>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── HELPER COMPONENTS ───────────────────────────────────────────────────────
function ProductCardComponent({
  product,
  currency,
  onAdd,
  t,
  delay
}: {
  product: Product
  currency: string
  onAdd: (p: Product) => void
  t: (k: string) => string
  delay: number
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: delay * 0.1 }}
      whileHover={{ y: -6 }}
      className="group flex flex-col bg-bg-base border border-border-base rounded-sm p-4 transition-all duration-300 hover:shadow-lg hover:border-accent/20"
    >
      <div className="relative aspect-[4/5] bg-bg-surface rounded-sm overflow-hidden mb-5">
        {product.image ? (
          <Image 
            src={normalizeImageSrc(product.image)} 
            alt={t(`product.${product.id}.name`)} 
            fill 
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width:768px) 90vw, (max-width:1200px) 45vw, 25vw"
          />
        ) : (
          <PlaceholderImage />
        )}
        {product.badge && (
          <span className="absolute top-3 left-3 bg-accent text-bg-base text-[9px] font-bold tracking-[0.2em] uppercase px-3 py-1.5 rounded-sm shadow-md">
            {t(`badge.${product.badge}`)}
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-base tracking-wide leading-snug">{t(`product.${product.id}.name`)}</h3>
          <span className="text-sm font-semibold text-accent shrink-0 ml-3">{currency}{product.price}</span>
        </div>
        <p className="text-text-muted text-xs leading-relaxed mb-5 flex-1">{t(`product.${product.id}.desc`)}</p>
        <button
          onClick={() => onAdd(product)}
          className="w-full py-3 bg-text-base text-bg-base text-xs font-semibold tracking-wider uppercase hover:opacity-90 transition-opacity rounded-sm transform active:scale-[0.98] transition-transform"
        >
          {t('cart.add')}
        </button>
      </div>
    </motion.div>
  )
}

function NewsletterComponent({ t }: { t: (k: string) => string }) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="max-w-md mx-auto text-center"
    >
      <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl md:text-4xl font-light mb-3">
        {t('section.newsletter.h2')}
      </h2>
      <p className="text-text-muted text-sm mb-8 leading-relaxed">
        {t('section.newsletter.sub')}
      </p>
      {done ? (
        <p className="text-accent text-sm font-semibold tracking-wider">
          ✓ {t('section.newsletter.thanks')}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (email) setDone(true)
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('section.newsletter.placeholder')}
            className="flex-1 bg-bg-surface border border-border-base px-5 py-3.5 text-sm outline-none focus:border-accent rounded-sm transition-colors text-text-base placeholder:text-text-muted/40"
          />
          <button
            type="submit"
            className="px-8 py-3.5 bg-text-base text-bg-base text-xs font-bold tracking-wider uppercase hover:opacity-95 transition-opacity rounded-sm whitespace-nowrap"
          >
            {t('section.newsletter.btn')}
          </button>
        </form>
      )}
    </motion.div>
  )
}

function PlaceholderImage() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-bg-surface text-text-muted select-none border border-dashed border-border-base/40 rounded-sm">
      <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
      <span className="text-[10px] tracking-wider uppercase font-semibold opacity-40">No Image</span>
    </div>
  )
}
