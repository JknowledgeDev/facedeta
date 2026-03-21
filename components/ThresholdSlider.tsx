'use client'

interface ThresholdSliderProps {
  value: number
  onChange: (value: number) => void
}

const PRESETS = [
  {
    value: 60,
    name: 'กว้างๆ',
    icon: '🔍',
    color: 'amber',
    desc: 'ค้นหากว้าง เจอรูปได้มากขึ้น แต่อาจมีรูปที่ไม่ใช่คนเดิมปน',
    borderSelected: 'border-amber-400 bg-amber-50',
    borderUnselected: 'border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50/50',
    badge: 'bg-amber-100 text-amber-700',
    pct: 'text-amber-600',
  },
  {
    value: 75,
    name: 'ตัวประกอบ',
    icon: '👥',
    color: 'blue',
    desc: 'สมดุล เหมาะกับรูปหมู่หรือรูปที่ถ่ายระยะกลาง',
    borderSelected: 'border-blue-400 bg-blue-50',
    borderUnselected: 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50',
    badge: 'bg-blue-100 text-blue-700',
    pct: 'text-blue-600',
  },
  {
    value: 90,
    name: 'ตัวหลัก',
    icon: '🎯',
    color: 'green',
    desc: 'แม่นยำสูง เหมาะเมื่อเห็นหน้าชัดเจน ภาพไม่เบลอ',
    borderSelected: 'border-green-400 bg-green-50',
    borderUnselected: 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/50',
    badge: 'bg-green-100 text-green-700',
    pct: 'text-green-600',
  },
]

export default function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  // Find the closest preset to current value (for initial display)
  const activePreset = PRESETS.find((p) => p.value === value) ?? PRESETS[1]

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">ระดับการค้นหา</p>
      <div className="grid grid-cols-3 gap-3">
        {PRESETS.map((preset) => {
          const isSelected = value === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              className={`
                relative rounded-xl border-2 p-3 text-left cursor-pointer
                transition-all duration-200
                ${isSelected ? preset.borderSelected + ' shadow-sm' : preset.borderUnselected}
              `}
            >
              {/* Icon + Name row */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xl leading-none">{preset.icon}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${preset.badge}`}>
                  {preset.value}%
                </span>
              </div>

              {/* Preset name */}
              <p className={`text-sm font-semibold ${isSelected ? preset.pct : 'text-gray-700'}`}>
                {preset.name}
              </p>

              {/* Description */}
              <p className="text-xs text-gray-400 mt-1 leading-snug">{preset.desc}</p>

              {/* Selected indicator dot */}
              {isSelected && (
                <span
                  className={`absolute top-2 left-2 w-2 h-2 rounded-full ${
                    preset.color === 'amber'
                      ? 'bg-amber-400'
                      : preset.color === 'blue'
                      ? 'bg-blue-400'
                      : 'bg-green-400'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 text-center">
        เลือก &ldquo;{activePreset.name}&rdquo; — {activePreset.desc}
      </p>
    </div>
  )
}
