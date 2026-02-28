'use client'

import { useEffect, useRef } from 'react'

export function DemoSeeder() {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    fetch('/api/demo/seed', { method: 'POST' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.seeded) window.location.reload()
      })
      .catch(() => {})
  }, [])

  return null
}
