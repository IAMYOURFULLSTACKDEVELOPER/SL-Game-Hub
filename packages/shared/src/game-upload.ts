/**
 * Game Upload Validation
 * Validates HTML5 game bundles uploaded by admins
 */

export interface UploadGameManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  minPlayers: number;
  maxPlayers: number;
  modes: ('single' | 'multi')[];
  entryPoint: string; // HTML file to load
  thumbnail?: string;
  author?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface UploadConfig {
  maxFileSize: number; // in bytes
  allowedMimeTypes: string[];
  requiredFiles: string[];
  maxBundleSize: number; // in bytes
}

const DEFAULT_CONFIG: UploadConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ['application/zip', 'application/x-zip-compressed'],
  requiredFiles: ['index.html', 'game-manifest.json'],
  maxBundleSize: 50 * 1024 * 1024, // 50MB
};

/**
 * Validate file type and size
 */
export function validateFile(
  file: File,
  config: UploadConfig = DEFAULT_CONFIG
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file type
  if (!config.allowedMimeTypes.includes(file.type)) {
    errors.push(`Invalid file type: ${file.type}. Only ZIP files are allowed.`);
  }

  // Check file size
  if (file.size > config.maxFileSize) {
    errors.push(
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is ${
        config.maxFileSize / 1024 / 1024
      }MB.`
    );
  }

  if (file.size === 0) {
    errors.push('File is empty.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate game manifest structure
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      errors: ['Manifest is not a valid object'],
      warnings,
    };
  }

  const m = manifest as Record<string, unknown>;

  // Required fields
  if (!m.id || typeof m.id !== 'string') {
    errors.push('Manifest missing required field: id');
  } else if (!/^[a-z0-9-]{2,40}$/.test(m.id)) {
    errors.push('Invalid id format. Must be 2-40 lowercase alphanumeric characters and hyphens.');
  }

  if (!m.name || typeof m.name !== 'string') {
    errors.push('Manifest missing required field: name');
  } else if (m.name.length < 2 || m.name.length > 60) {
    errors.push('Name must be between 2 and 60 characters.');
  }

  if (!m.description || typeof m.description !== 'string') {
    errors.push('Manifest missing required field: description');
  } else if (m.description.length > 400) {
    errors.push('Description must be at most 400 characters.');
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push('Manifest missing required field: version');
  } else if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(m.version)) {
    errors.push('Invalid version format. Must be semver (e.g., 1.0.0).');
  }

  if (!m.entryPoint || typeof m.entryPoint !== 'string') {
    errors.push('Manifest missing required field: entryPoint');
  } else if (!m.entryPoint.endsWith('.html')) {
    errors.push('Entry point must be an HTML file.');
  }

  // Optional fields with validation
  if (m.minPlayers !== undefined) {
    if (typeof m.minPlayers !== 'number' || m.minPlayers < 1) {
      errors.push('minPlayers must be a number >= 1');
    }
  }

  if (m.maxPlayers !== undefined) {
    if (typeof m.maxPlayers !== 'number' || m.maxPlayers < 1) {
      errors.push('maxPlayers must be a number >= 1');
    }
  }

  const minP = typeof m.minPlayers === 'number' ? m.minPlayers : undefined;
  const maxP = typeof m.maxPlayers === 'number' ? m.maxPlayers : undefined;
  if (minP !== undefined && maxP !== undefined && minP > maxP) {
    errors.push('minPlayers cannot be greater than maxPlayers');
  }

  if (m.modes !== undefined) {
    if (!Array.isArray(m.modes)) {
      errors.push('modes must be an array');
    } else {
      const validModes = ['single', 'multi'];
      const invalidModes = m.modes.filter((mode) => !validModes.includes(mode));
      if (invalidModes.length > 0) {
        errors.push(`Invalid modes: ${invalidModes.join(', ')}. Must be single or multi.`);
      }
    }
  }

  // Security warnings
  if (m.id === 'snake' || m.id === 'snake-and-ladder') {
    warnings.push('This ID conflicts with built-in games. Consider a unique ID.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Basic safety checks for file contents
 * In production, this would integrate with malware scanning services
 */
export function performSafetyChecks(file: File): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // File extension check
  if (!file.name.endsWith('.zip')) {
    errors.push('File must have .zip extension');
  }

  // Check for suspicious file patterns in name
  const suspiciousPatterns = [
    /\.exe$/i,
    /\.bat$/i,
    /\.sh$/i,
    /\.cmd$/i,
    /\.scr$/i,
    /\.vbs$/i,
    /\.js$/i,
  ];

  if (suspiciousPatterns.some((pattern) => pattern.test(file.name))) {
    warnings.push('File name contains potentially executable extension');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Complete validation pipeline for game upload
 */
export async function validateGameUpload(
  file: File,
  manifestText: string,
  config: UploadConfig = DEFAULT_CONFIG
): Promise<ValidationResult> {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Step 1: Validate file
  const fileResult = validateFile(file, config);
  allErrors.push(...fileResult.errors);
  allWarnings.push(...fileResult.warnings);

  // Step 2: Safety checks
  const safetyResult = performSafetyChecks(file);
  allErrors.push(...safetyResult.errors);
  allWarnings.push(...safetyResult.warnings);

  // Step 3: Parse and validate manifest
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (e) {
    allErrors.push('Manifest is not valid JSON');
    return {
      valid: false,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  const manifestResult = validateManifest(manifest);
  allErrors.push(...manifestResult.errors);
  allWarnings.push(...manifestResult.warnings);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Extract manifest from zip file (client-side)
 * This is a placeholder - in production you'd use a library like jszip
 */
export async function extractManifestFromZip(file: File): Promise<string | null> {
  // In production, this would use jszip or similar to extract game-manifest.json
  // For now, we'll return null and handle extraction server-side
  return null;
}
