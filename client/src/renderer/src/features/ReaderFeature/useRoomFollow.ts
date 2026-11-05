/**
 * 跟随模式钩子：开启后，房间内其他成员的位置变化把阅读器带到同一位置。
 * 三道闸门（防"跟错书"与"回声循环"）：
 * ① 开关打开（经 ref 读取 —— 监听只挂一次，不随开关重挂）；
 * ② 当前打开的书 = 房间绑定的书（指纹比对，与位置上报同口径）；
 * ③ 目标位置 ≠ 当前位置（同位不跳：否则我跳过去的回执会把对方再拽一次）。
 * 只跟"位置事件"，不区分是谁 —— 共读的语义是"一起读这本书"，不是监控某个人。
 */
import { useEffect, useRef } from 'react'
import { sameLocation } from '@core/domain/location'
import type { BookFingerprint } from '@core/domain/types'
import type { ServiceContainer } from '@core/container'
import type { FeatureHost } from '../types'

export function useRoomFollow(params: {
  container: ServiceContainer
  host: FeatureHost
  /** 跟随开关（聊天格「跟隨」；经 ref 读取，开关变化不重挂监听） */
  following: boolean
}): void {
  const { container, host, following } = params
  const followingRef = useRef(following)
  followingRef.current = following
  useEffect(() => {
    return container.room.on('location-updated', (loc) => {
      if (!followingRef.current) return
      const open = container.render.getOpenBook()
      const edition = container.room.getRoomState()?.edition
      if (!open || !edition) return
      const roomFp: BookFingerprint = {
        algorithm: edition.hashAlgo as BookFingerprint['algorithm'],
        hash: edition.hash,
        size: edition.size
      }
      if (!container.identity.verify(open.fingerprint, roomFp)) return
      if (sameLocation(container.render.getPosition(), loc, open.format)) return
      container.render.goToPosition(loc).catch((err: Error) => {
        // 跟随失败不冒泡打断阅读（下一次位置事件会再带过来）
        host.pushLog(`跟隨跳轉失敗：${err.message}`)
      })
    })
  }, [container, host])
}
