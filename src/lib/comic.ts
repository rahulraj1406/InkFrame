import JSZip from 'jszip';

export interface ComicPage {
  name: string;
  blob: Blob;
  url: string;
}

export interface ComicBook {
  title: string;
  pages: ComicPage[];
}

// Function to read a CBZ (ZIP) file and extract its images
export async function loadCbZFile(file: File): Promise<ComicBook> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  
  const pages: ComicPage[] = [];
  
  // Supported image extensions
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

  // Iterate over all files in the zip
  for (const [filename, zipEntry] of Object.entries(loadedZip.files)) {
    // Skip directories and hidden files (e.g., __MACOSX)
    if (zipEntry.dir || filename.includes('__MACOSX') || filename.split('/').pop()?.startsWith('.')) {
      continue;
    }

    const lowerName = filename.toLowerCase();
    const isValidImage = validExtensions.some(ext => lowerName.endsWith(ext));

    if (isValidImage) {
      // Extract the file as a Blob
      const blob = await zipEntry.async('blob');
      
      // We create an Object URL so we can render it in an <img> tag easily
      const url = URL.createObjectURL(blob);
      
      pages.push({
        name: filename,
        blob,
        url
      });
    }
  }

  // Sort pages alphabetically by their original filename inside the zip
  // Natural sort so that 'page_2.jpg' comes before 'page_10.jpg'
  pages.sort((a, b) => {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return {
    title: file.name.replace(/\.cbz$/i, ''),
    pages
  };
}
