import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOG_CACHE_TTL_MS,
  getCachedActiveBooks,
  invalidateCatalogCache,
} from './catalog-cache.js'
import type { BookRecord } from './types/index.js'

const books = [{ id: 'b1' }] as BookRecord[]

beforeEach(() => {
  invalidateCatalogCache()
})

describe('cache do acervo (getCachedActiveBooks)', () => {
  it('carrega na primeira chamada e reaproveita nas seguintes', async () => {
    const load = vi.fn().mockResolvedValue(books)

    await getCachedActiveBooks(load, 1000)
    const second = await getCachedActiveBooks(load, 1000 + 5000)

    expect(load).toHaveBeenCalledTimes(1)
    expect(second).toBe(books)
  })

  it('recarrega quando o tempo de validade passa', async () => {
    const load = vi.fn().mockResolvedValue(books)

    await getCachedActiveBooks(load, 1000)
    await getCachedActiveBooks(load, 1000 + CATALOG_CACHE_TTL_MS - 1)
    expect(load).toHaveBeenCalledTimes(1)

    await getCachedActiveBooks(load, 1000 + CATALOG_CACHE_TTL_MS)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('recarrega depois de invalidateCatalogCache', async () => {
    const load = vi.fn().mockResolvedValue(books)

    await getCachedActiveBooks(load, 1000)
    invalidateCatalogCache()
    await getCachedActiveBooks(load, 1000)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('não guarda nada se o carregamento falha', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce(books)

    await expect(getCachedActiveBooks(load, 1000)).rejects.toThrow('falhou')
    expect(await getCachedActiveBooks(load, 1000)).toBe(books)
  })
})
