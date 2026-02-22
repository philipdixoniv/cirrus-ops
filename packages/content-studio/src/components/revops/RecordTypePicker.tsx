import { RECORD_TYPE_LIST, type RecordType } from "@/lib/recordTypes";

const colorMap: Record<string, {
  selected: string;
  unselected: string;
  label: string;
  check: string;
}> = {
  blue: {
    selected: "border-blue-500 bg-blue-50",
    unselected: "border-gray-200 bg-white hover:border-blue-300",
    label: "text-blue-700",
    check: "text-blue-500",
  },
  green: {
    selected: "border-green-500 bg-green-50",
    unselected: "border-gray-200 bg-white hover:border-green-300",
    label: "text-green-700",
    check: "text-green-500",
  },
  purple: {
    selected: "border-purple-500 bg-purple-50",
    unselected: "border-gray-200 bg-white hover:border-purple-300",
    label: "text-purple-700",
    check: "text-purple-500",
  },
};

function getColors(rt: RecordType) {
  return colorMap[rt.color] || colorMap.blue;
}

interface RecordTypePickerProps {
  value: string | null;
  onSelect: (id: string) => void;
}

export function RecordTypePicker({ value, onSelect }: RecordTypePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {RECORD_TYPE_LIST.map((rt) => {
        const colors = getColors(rt);
        const isSelected = value === rt.id;

        return (
          <button
            key={rt.id}
            onClick={() => onSelect(rt.id)}
            className={`relative p-5 rounded-lg border-2 text-left transition-all hover:shadow-md ${
              isSelected ? colors.selected : colors.unselected
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-semibold ${colors.label}`}>{rt.label}</span>
              {isSelected && (
                <svg
                  className={`w-5 h-5 ${colors.check}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{rt.description}</p>
          </button>
        );
      })}
    </div>
  );
}
