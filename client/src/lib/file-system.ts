// Project templates and utilities for G2 Commesse

export interface FolderStructure {
  [folderName: string]: FolderStructure | {};
}

export interface ProjectTemplate {
  name: string;
  structure: FolderStructure;
}

// Template autentico GB Engineering da file ZIP di riferimento
const TEMPLATE_LUNGO: FolderStructure = {
  "1_CONSEGNA": {},
  "2_PERMIT": {},
  "3_PROGETTO": {
    "ARC": {},
    "CME": {},
    "CRONO_CAPITOLATI_MANUT": {},
    "IE": {},
    "IM": {},
    "IS": {},
    "REL": {},
    "SIC": {},
    "STR": {},
    "X_RIF": {},
  },
  "4_MATERIALE_RICEVUTO": {},
  "5_CANTIERE": {
    "0_PSC_FE": {},
    "IMPRESA": {
      "CONTRATTO": {},
      "CONTROLLI": {},
      "DOCUMENTI": {},
    },
  },
  "6_VERBALI_NOTIFICHE_COMUNICAZIONI": {
    "COMUNICAZIONI": {},
    "NP": {},
    "ODS": {},
    "VERBALI": {},
  },
  "7_SOPRALLUOGHI": {},
  "8_VARIANTI": {},
  "9_PARCELLA": {},
  "10_INCARICO": {},
};

// Template BREVE aggiornato da file ZIP di riferimento
const TEMPLATE_BREVE: FolderStructure = {
  "CONSEGNA": {},
  "ELABORAZIONI": {},
  "MATERIALE_RICEVUTO": {},
  "SOPRALLUOGHI": {},
};

export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  LUNGO: {
    name: "LUNGO - Progetti complessi",
    structure: TEMPLATE_LUNGO,
  },
  BREVE: {
    name: "BREVE - Progetti semplici", 
    structure: TEMPLATE_BREVE,
  },
};


// Generate script commands for fallback
export const generateScriptCommands = (
  structure: FolderStructure,
  basePath: string = ""
): { batch: string[]; shell: string[] } => {
  const batchCommands: string[] = [];
  const shellCommands: string[] = [];

  const generateCommands = (struct: FolderStructure, currentPath: string = "") => {
    for (const [folderName, subStructure] of Object.entries(struct)) {
      const sanitizedName = sanitizeFileName(folderName);
      const fullPath = currentPath ? `${currentPath}/${sanitizedName}` : sanitizedName;
      const winPath = fullPath.replace(/\//g, "\\");
      
      batchCommands.push(`mkdir "${basePath ? `${basePath}\\${winPath}` : winPath}"`);
      shellCommands.push(`mkdir -p "${basePath ? `${basePath}/${fullPath}` : fullPath}"`);
      
      if (subStructure && Object.keys(subStructure).length > 0) {
        generateCommands(subStructure, fullPath);
      }
    }
  };

  generateCommands(structure);
  
  return { batch: batchCommands, shell: shellCommands };
};

// Create and download script files
export const downloadScriptFiles = (
  projectCode: string,
  projectObject: string,
  template: string
): void => {
  const templateData = PROJECT_TEMPLATES[template];
  if (!templateData) {
    throw new Error(`Template non trovato: ${template}`);
  }

  const cleanObjectName = projectObject.replace(/\s+/g, '_').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  const projectFolderName = `${projectCode}_${cleanObjectName}`;
  const { batch, shell } = generateScriptCommands(templateData.structure, projectFolderName);

  // Create batch file content
  const batchContent = [
    `@echo off`,
    `echo Creazione struttura cartelle per progetto ${projectCode}`,
    `echo.`,
    ...batch,
    `echo.`,
    `echo Struttura cartelle creata con successo!`,
    `pause`
  ].join('\r\n');

  // Create shell script content
  const shellContent = [
    `#!/bin/bash`,
    `echo "Creazione struttura cartelle per progetto ${projectCode}"`,
    `echo`,
    ...shell,
    `echo`,
    `echo "Struttura cartelle creata con successo!"`
  ].join('\n');

  // Download batch file
  downloadFile(`${projectCode}_create_structure.bat`, batchContent);
  
  // Download shell script
  downloadFile(`${projectCode}_create_structure.sh`, shellContent);
};

// Utility functions
export const sanitizeFileName = (fileName: string): string => {
  // List of valid G2 template folder names that should not be prefixed
  const validG2FolderNames = [
    '1_CONSEGNA', '2_PERMIT', '3_PROGETTO', '4_MATERIALE_RICEVUTO', '5_CANTIERE',
    '6_VERBALI_NOTIFICHE_COMUNICAZIONI', '7_SOPRALLUOGHI', '8_VARIANTI', '9_PARCELLA', '10_INCARICO',
    '0_PSC_FE'
  ];

  // If this is a valid G2 template folder name, return as-is (they are already valid)
  if (validG2FolderNames.includes(fileName)) {
    return fileName;
  }

  // List of reserved names in Windows
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

  // Check if we're likely in a Windows local environment
  const isWindowsLocal = window.location.hostname === 'localhost' && navigator.platform.toLowerCase().includes('win');

  // Ultra-conservative approach for local Windows environments
  let sanitized = fileName
    // First pass: replace known problematic characters
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    // Second pass: For Windows local, be extra conservative
    .replace(isWindowsLocal ? /[^a-zA-Z0-9_]/g : /[^a-zA-Z0-9_\-]/g, '_')
    // Replace multiple underscores with single
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    // Limit length to be safe for all filesystems (increased for project names)
    .substring(0, 100);

  // Check if it's a reserved name and handle it
  const nameUpper = sanitized.toUpperCase();
  if (reservedNames.includes(nameUpper) || reservedNames.includes(nameUpper.replace(/^\d+_?/, ''))) {
    sanitized = `DIR_${sanitized}`;
  }

  // Ensure it doesn't start with a number - prefix with a letter instead of PROJ_
  // But only for non-template folder names
  if (/^\d/.test(sanitized) && !validG2FolderNames.includes(fileName)) {
    sanitized = `F_${sanitized}`;
  }

  // Ensure it's not empty
  if (!sanitized || sanitized === '_') {
    sanitized = 'FOLDER';
  }

  // Final validation - make sure it's truly safe
  // Allow numbers at the start for G2 template folders
  const isValidPattern = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(sanitized) ||
                        /^\d+_[a-zA-Z][a-zA-Z0-9_]*$/.test(sanitized);

  if (!isValidPattern) {
    sanitized = `SAFE_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  return sanitized;
};

const getFolderList = (structure: FolderStructure, basePath: string = ""): string[] => {
  const folders: string[] = [];
  
  const addFolders = (struct: FolderStructure, currentPath: string = "") => {
    for (const [folderName, subStructure] of Object.entries(struct)) {
      const fullPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      folders.push(fullPath);
      
      if (subStructure && Object.keys(subStructure).length > 0) {
        addFolders(subStructure, fullPath);
      }
    }
  };

  addFolders(structure, basePath);
  return folders;
};

const downloadFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

