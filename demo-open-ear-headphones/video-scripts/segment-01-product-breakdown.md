# Seedance / Jimeng Multi-Phase Video Prompt

## Usage

- Input image 1: generated 3x3 storyboard grid as first frame / visual reference.
- Input image 2: generated product multiview as product anchor.
- Duration: 15 seconds.
- Format: 16:9 horizontal.

## Multi-Phase Video Prompt

风格：超写实 CG 产品广告 / 低调黑色影棚 / 冷钛银轮廓光 / 电光青色扫描光 / PBR 金属材质 / 画面干净克制 / 无背景音乐 / 产品@产品多视图图片 的广告。

Phase 1 (0-3s): 轮廓唤醒
纯黑影棚中，镜头从远处缓慢推进，开放式运动耳机的钛银边缘被一束窄轮廓光逐步勾亮。电光青色状态灯从左到右轻轻点亮，耳机完整悬浮，保持轻薄流线型姿态。

Phase 2 (3-6s): 声学舱微距
镜头切到侧仰近景，沿左侧椭圆声学舱缓慢滑动。拉丝钛银倒角反射冷光，细密黑色声孔阵列清晰可见，耳挂曲线在景深中虚化延伸。光线像扫描仪一样扫过金属表面。

Phase 3 (6-9s): 悬浮拆解
耳机在中景中缓慢旋转，声学舱、耳挂连接件、微型电池核心沿结构方向轻轻分离，形成精准爆炸视图。青色能量线连接组件，分离动作缓慢、干净、有机械精密感，产品整体轮廓仍可辨认。

Phase 4 (9-12s): 开放声场
组件重新靠近，透明空气流线绕过声学舱与耳道位置，声波同心圆向外扩散，强调开放式不入耳的空间感。几颗水珠掠过钛金属表面并弹开，声孔保持干净，冷光与青光交替流动。

Phase 5 (12-15s): 回位定格
所有组件沿青色轨迹吸附回位，耳机完成组装并稳定悬浮。镜头拉到 3/4 英雄角度，产品位于画面中央偏下，上方留出 Logo 空间，下方留出 Slogan 空间。青色状态灯减弱，冷钛银轮廓光保留，最终静止定格。

光影要求：全片保持低调黑色影棚，主光为右后方冷钛银轮廓光，辅光为极细电光青色扫描光。光效只服务于产品结构，不要生成复杂背景、人物、文字、Logo 或额外道具。

## Notes

- Keep the product shape consistent with the product multiview.
- Avoid background music because music should be added later as a separate editing layer.
- If the model over-animates the breakdown, reduce Phase 3 to "slight separation" rather than "explosion".
