
import React from 'react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

export interface VitalSignProps {
  label: string;
  value: string | number;
  unit: string;
  trend?: 'rising' | 'falling' | 'stable' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  isFinalReading?: boolean;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  secondaryLabel?: string;
  statusText?: string;
  statusColor?: string;
  temperatureLocation?: string;
  temperatureTrend?: 'rising' | 'falling' | 'stable';
  cholesterolData?: {
    hdl: number;
    ldl: number;
    triglycerides?: number;
  };
}

/**
 * Component for displaying vital sign with trend and quality indication
 * 100% REAL MEASUREMENTS - NO SIMULATION ALLOWED
 */
const VitalSign: React.FC<VitalSignProps> = ({
  label,
  value,
  unit,
  trend = 'stable',
  isFinalReading = false,
  secondaryValue,
  secondaryUnit,
  secondaryLabel,
  statusText,
  statusColor,
  temperatureLocation,
  temperatureTrend,
  cholesterolData
}) => {
  const getTrendIcon = () => {
    switch(trend) {
      case 'rising':
        return '↗️';
      case 'falling':
        return '↘️';
      case 'rising_rapidly':
        return '⬆️';
      case 'falling_rapidly':
        return '⬇️';
      case 'stable':
        return '➡️';
      default:
        return '•';
    }
  };

  const getTrendColor = () => {
    switch(trend) {
      case 'rising':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'falling':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'rising_rapidly':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'falling_rapidly':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
      case 'stable':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  // Función para determinar el color del valor basado en la etiqueta y el valor
  const getValueColor = () => {
    if (label.toLowerCase().includes('cardíaca') || label.toLowerCase().includes('heart')) {
      // Para frecuencia cardíaca
      const bpm = typeof value === 'number' ? value : parseInt(value.toString());
      if (bpm < 60) return 'text-blue-400';
      if (bpm > 100) return 'text-orange-400';
      return 'text-orange-400';
    } 
    else if (label.toLowerCase().includes('spo2')) {
      // Para SpO2
      const spo2 = typeof value === 'number' ? value : parseInt(value.toString());
      if (spo2 < 95) return 'text-red-400';
      return 'text-white';
    }
    else if (label.toLowerCase().includes('presión') || label.toLowerCase().includes('pressure')) {
      return 'text-blue-400';
    }
    else if (label.toLowerCase().includes('respiración') || label.toLowerCase().includes('respiration')) {
      return 'text-red-500';
    }
    else if (label.toLowerCase().includes('glucosa') || label.toLowerCase().includes('glucose')) {
      return 'text-green-400';
    }
    else if (label.toLowerCase().includes('hemoglobina') || label.toLowerCase().includes('hemoglobin')) {
      return 'text-purple-400';
    }
    else if (label.toLowerCase().includes('colesterol') || label.toLowerCase().includes('cholesterol')) {
      return 'text-yellow-400';
    }
    else if (label.toLowerCase().includes('temperatura') || label.toLowerCase().includes('temperature')) {
      return temperatureTrend === 'rising' ? 'text-red-500' : 
             temperatureTrend === 'falling' ? 'text-blue-500' : 'text-yellow-500';
    }
    else if (label.toLowerCase().includes('arritmia') || label.toLowerCase().includes('arrhythmia')) {
      return 'text-white';
    }
    
    return 'text-white';
  };

  // Determinar el texto de estado basado en la etiqueta y el valor
  const getStatusText = () => {
    if (statusText) return statusText;
    
    if (label.toLowerCase().includes('cardíaca') || label.toLowerCase().includes('heart')) {
      const bpm = typeof value === 'number' ? value : parseInt(value.toString());
      if (bpm < 60) return 'BRADICARDIA';
      if (bpm > 100) return 'LEVE TAQUICARDIA';
      return 'NORMAL';
    }
    else if (label.toLowerCase().includes('presión') || label.toLowerCase().includes('pressure')) {
      return 'PRESIÓN NORMAL';
    }
    else if (label.toLowerCase().includes('respiración') || label.toLowerCase().includes('respiration')) {
      return secondaryValue && parseInt(secondaryValue.toString()) > 40 ? 'TAQUIPNEA' : 'NORMAL';
    }
    else if (label.toLowerCase().includes('glucosa') || label.toLowerCase().includes('glucose')) {
      const glucoseVal = typeof value === 'number' ? value : parseInt(value.toString());
      if (glucoseVal < 70) return 'HIPOGLUCEMIA';
      if (glucoseVal > 110) return 'HIPERGLUCEMIA';
      return 'NORMAL';
    }
    else if (label.toLowerCase().includes('arritmia') || label.toLowerCase().includes('arrhythmia')) {
      return value === 0 || value === '0' || value === '--' ? 'NO DETECTADA' : 'RIESGO MÍNIMO';
    }
    
    return '';
  };

  return (
    <Card className="p-3 flex flex-col space-y-1 bg-black text-white border-0 rounded-xl overflow-hidden relative">
      <div className="text-center pb-1 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{label}</h3>
      </div>
      
      {label.toLowerCase().includes('arritmia') || label.toLowerCase().includes('arrhythmia') ? (
        <>
          <div className="flex justify-center pt-1">
            <span className="text-2xl font-bold tracking-tighter text-white">{value === '--' ? 'ARRITMIA' : 'ARRITMIA DETECTADA'}</span>
          </div>
          {value !== '--' && value !== 0 && (
            <div className="flex justify-center">
              <span className="text-4xl font-bold">{value}</span>
            </div>
          )}
          <div className="flex justify-center mt-auto pt-1">
            <span className="text-xs text-gray-400">{getStatusText()}</span>
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-center items-baseline space-x-1 pt-1">
            <span className={`text-4xl font-bold tracking-tighter ${getValueColor()}`}>{value}</span>
            <span className="text-xs text-gray-400">{unit}</span>
          </div>
          
          {secondaryValue && secondaryUnit && (
            <div className="flex justify-center items-baseline space-x-1">
              <span className={`text-2xl font-medium tracking-tighter ${label.toLowerCase().includes('respiración') ? 'text-red-500' : 'text-gray-300'}`}>
                {secondaryValue}
              </span>
              <span className="text-xs text-gray-400">{secondaryUnit}</span>
            </div>
          )}
          
          {/* Para colesterol, mostrar HDL/LDL */}
          {cholesterolData && (
            <div className="flex justify-center items-center space-x-2 text-xs">
              <span className="text-gray-400">HDL: <span className="text-yellow-300">{cholesterolData.hdl}</span></span>
              <span className="text-gray-400">LDL: <span className="text-yellow-300">{cholesterolData.ldl}</span></span>
            </div>
          )}
          
          {/* Para temperatura, mostrar ubicación */}
          {temperatureLocation && (
            <div className="flex justify-center items-center text-xs">
              <span className="text-gray-400">Loc: <span className="text-yellow-300">{temperatureLocation}</span></span>
            </div>
          )}
          
          {getStatusText() && (
            <div className="flex justify-center mt-auto pt-1">
              <span className={`text-xs ${statusColor || getValueColor()}`}>{getStatusText()}</span>
            </div>
          )}
        </>
      )}
      
      {isFinalReading && (
        <div className="absolute top-1 right-1">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
        </div>
      )}
    </Card>
  );
};

export default VitalSign;
