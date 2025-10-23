import React, { useState } from 'react';
import JSZip from 'jszip';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { database } from '@/services/database';

type FileEntry = {
  name: string;
  type?: string;
};

async function listDir(path: string) {
  try {
    const res = await Filesystem.readdir({ directory: Directory.Data, path });
    return res.files as FileEntry[];
  } catch (e) {
    return [] as FileEntry[];
  }
}

async function readBase64(path: string) {
  const res = await Filesystem.readFile({ directory: Directory.Data, path });
  // @ts-ignore
  return res.data as string;
}

async function collectInternalFiles(zip: JSZip) {
  const folders = ['images', 'pdfs', 'thumbnails'];
  for (const dir of folders) {
    const entries = await listDir(dir);
    if (entries.length === 0) continue;
    const zf = zip.folder(`internal_files/${dir}`);
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      try {
        const data = await readBase64(fullPath);
        zf?.file(entry.name, data, { base64: true });
      } catch (e) {
        // skip unreadable file
      }
    }
  }
}

async function collectDatabaseJson() {
  // Build a flat dump of all rows by traversing relationships
  const projects = await database.getAllProjects();
  const allPlans: any[] = [];
  const allPoints: any[] = [];
  const allImages: any[] = [];

  for (const project of projects) {
    const plans = await database.getPlansByProject(project.id);
    allPlans.push(...plans);
    for (const plan of plans) {
      const points = await database.getPointsByPlan(plan.id);
      allPoints.push(...points);
      for (const point of points) {
        const images = await database.getImagesByPoint(point.id);
        allImages.push(...images);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    platform: Capacitor.getPlatform(),
    projects,
    plans: allPlans,
    points: allPoints,
    images: allImages
  };
}

const SupportBundleButton = () => {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string>('');

  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    setLabel('Collecting data...');
    try {
      const zip = new JSZip();

      // Database JSON
      const dbJson = await collectDatabaseJson();
      zip.file('database.json', JSON.stringify(dbJson));

      // Internal files
      setLabel('Bundling internal files...');
      await collectInternalFiles(zip);

      setLabel('Creating bundle...');
      const content = await zip.generateAsync({ type: 'blob' });

      if (Capacitor.isNativePlatform()) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result as string;
            const fileName = `support_bundle_${Date.now()}.zip`;
            await Filesystem.writeFile({
              path: `Download/${fileName}`,
              data: base64Data.split(',')[1],
              directory: Directory.ExternalStorage,
              recursive: true
            });

            const fileUri = await Filesystem.getUri({
              directory: Directory.ExternalStorage,
              path: `Download/${fileName}`
            });

            await Share.share({
              title: 'Support Bundle',
              text: 'Zip with internal app data for support analysis',
              url: fileUri.uri,
              dialogTitle: 'Share Support Bundle'
            });

            setLabel('Bundle saved to Downloads');
          } catch (e) {
            setLabel('Failed to save/share bundle');
          } finally {
            setBusy(false);
          }
        };
        reader.readAsDataURL(content);
      } else {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `support_bundle_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setBusy(false);
        setLabel('Bundle downloaded');
      }
    } catch (e) {
      setBusy(false);
      setLabel('Failed to create bundle');
    }
  };

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={busy}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 w-full"
      >
        {busy ? `Preparing... ${label}` : 'Send Support Bundle'}
      </button>
      {busy && (
        <div className="mt-2 text-sm text-gray-600">{label}</div>
      )}
    </div>
  );
};

export default SupportBundleButton;


