'use client'

interface ThresholdSliderProps {
  value: number
  onChange: (value: number) => void
}

const PRESETS = [
  {
    value: 60,
    name: 'ค้นหาทั่วไป',
    icon: '🔍',
    desc: 'ค้นหากว้าง พบรูปได้มากขึ้น เหมาะกับรูปที่ถ่ายจากไกล',
    borderSelected: 'border-amber-400 bg-amber-50',
    borderUnselected: 'border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50/50',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-400',
    pct: 'text-amber-600',
  },
  {
    value: 75,
    name: 'ค้นหาละเอียด',
    icon: '👥',
    desc: 'สมดุล เหมาะกับรูปหมู่หรือรูปถ่ายระยะกลาง',
    borderSelected: 'border-green-400 bg-green-50',
    borderUnselected: 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/50',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-400',
    pct: 'text-green-600',
  },
  {
    value: 90,
    name: 'ค้นหารายบุคคล',
    icon: '🎯',
    desc: 'แม่นยำสูง เหมาะเมื่อเห็นหน้าชัดเจน ภาพไม่เบลอ',
    borderSelected: 'border-emerald-500 bg-emerald-50',
    borderUnselected: 'border-gray-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    pct: 'text-emerald-600',
  },
]

export default function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  const activePreset = PRESETS.find((p) => p.value === value) ?? PRESETS[1]

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-700">ระดับการค้นหา</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {PRESETS.map((preset) => {
          const isSelected = value === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              className={`relative rounded-xl border-2 p-2.5 sm:p-3 text-left cursor-pointer
                transition-all duration-200 ${isSelected ? preset.borderSelected + ' shadow-sm' : preset.borderUnselected}`}
            >
              {isSelected && (
                <span className={`absolute top-2 left-2 w-2 h-2 rounded-full ${preset.dot}`} />
              )}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-lg sm:text-xl leading-none">{preset.icon}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${preset.badge}`}>
                  {preset.value}%
                </span>
              </div>
              <p className={`text-xs sm:text-sm font-semibold leading-tight ${isSelected ? preset.pct : 'text-gray-700'}`}>
                {preset.name}
              </p>
              <p className="text-xs text-gray-400 mt-1 leading-snug hidden sm:block">{preset.desc}</p>
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
