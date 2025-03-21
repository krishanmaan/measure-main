'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDownload,
  faDrawPolygon,
  faRuler,
  faMapMarker,
  faPlus
} from '@fortawesome/free-solid-svg-icons';

interface CreateMenuProps {
  showMenu: boolean;
  onToggleMenu: () => void;
  onOptionSelect: (option: 'import' | 'field' | 'distance' | 'marker') => void;
}

const CreateMenu = ({ showMenu, onToggleMenu, onOptionSelect }: CreateMenuProps) => {
  return (
    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
      <div className="relative">
        {showMenu && (
          <div className="absolute bottom-full left-0 mb-3 bg-black bg-opacity-75 rounded-lg overflow-hidden w-48">
            <button 
              onClick={() => onOptionSelect('import')}
              className="w-full text-white p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors"
            >
              <FontAwesomeIcon icon={faDownload} className="h-5 w-5" />
              <span>Import</span>
            </button>
            <button 
              onClick={() => onOptionSelect('field')}
              className="w-full text-white p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors"
            >
              <FontAwesomeIcon icon={faDrawPolygon} className="h-5 w-5" />
              <span>Field</span>
            </button>
            <button 
              onClick={() => onOptionSelect('distance')}
              className="w-full text-white p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors"
            >
              <FontAwesomeIcon icon={faRuler} className="h-5 w-5" />
              <span>Distance</span>
            </button>
            <button 
              onClick={() => onOptionSelect('marker')}
              className="w-full text-white p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors"
            >
              <FontAwesomeIcon icon={faMapMarker} className="h-5 w-5" />
              <span>Marker</span>
            </button>
          </div>
        )}

        <button 
          onClick={onToggleMenu}
          className="bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-opacity-80 transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} className="h-5 w-5" />
          <span>Create new</span>
        </button>
      </div>
    </div>
  );
};

export default CreateMenu; 