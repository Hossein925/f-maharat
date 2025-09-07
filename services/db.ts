import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import Dexie, { Table } from 'dexie';
// FIX: Import LoggedInUser and UserRole to be used in the new findUser function.
import { Hospital, LoggedInUser, TrainingMaterial, UserRole } from '../types';

const supabaseUrl = 'https://mafgyafugqazpnnvlrls.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZmd5YWZ1Z3FhenBubnZscmxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNzU2NTcsImV4cCI6MjA3Mjg1MTY1N30.eo_qHukJ9DhQyvrL9WJvgDaxLRNQzae7Q0jJgZaoXXA';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

class AppDatabase extends Dexie {
  hospitals!: Table<Hospital, string>;
  files!: Table<{ id: string; data: string }, string>; // For offline file access

  constructor() {
    super('SkillAssessmentDB_v2');
    // FIX: The error "Property 'version' does not exist" is likely a TypeScript/compiler-specific issue
    // with recognizing inherited methods in this context. Casting `this` to Dexie is a robust
    // workaround that clarifies the type to the compiler without changing runtime behavior.
    (this as Dexie).version(1).stores({
      hospitals: 'id',
      files: 'id',
    });
  }
}

export const db = new AppDatabase();

// --- Data Sync and Management ---

export const getLocalHospitals = async (): Promise<Hospital[]> => {
  return await db.hospitals.toArray();
};

export const syncHospitalsWithSupabase = async (): Promise<Hospital[]> => {
  try {
    const { data, error } = await supabase.from('hospitals').select('*');
    if (error) throw error;
    
    // Clear local cache and save fresh data
    await db.hospitals.clear();
    await db.hospitals.bulkPut(data as Hospital[]);
    
    return data as Hospital[];
  } catch (error) {
    console.error("Error syncing with Supabase:", error);
    // If sync fails, return local data
    return getLocalHospitals();
  }
};

export const upsertHospital = async (hospital: Hospital) => {
    await db.hospitals.put(hospital); // Update local first for snappy UI
    const { error } = await supabase.from('hospitals').upsert(hospital, { onConflict: 'id' });
    if (error) {
        console.error("Supabase upsert failed:", error);
        // Handle potential rollback or notify user
    }
};

export const deleteHospitalById = async (hospitalId: string) => {
    await db.hospitals.delete(hospitalId);
    const { error } = await supabase.from('hospitals').delete().eq('id', hospitalId);
     if (error) {
        console.error("Supabase delete failed:", error);
    }
}

// FIX: Add findUser function to handle authentication logic.
// --- Authentication ---
const ADMIN_NATIONAL_ID = import.meta.env.VITE_ADMIN_NATIONAL_ID || '5850008985';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '64546';

export const findUser = (hospitals: Hospital[], nationalId: string, password: string): LoggedInUser | null => {
    // 1. Check for Admin
    if (nationalId === ADMIN_NATIONAL_ID && password === ADMIN_PASSWORD) {
        return { role: UserRole.Admin, name: 'ادمین کل' };
    }

    // 2. Iterate through hospitals to find other roles
    for (const hospital of hospitals) {
        // Check for Supervisor
        if (hospital.supervisorNationalId === nationalId && hospital.supervisorPassword === password) {
            return { role: UserRole.Supervisor, name: hospital.supervisorName || 'سوپروایزر', hospitalId: hospital.id };
        }

        for (const department of hospital.departments) {
            // Check for Manager
            if (department.managerNationalId === nationalId && department.managerPassword === password) {
                return { role: UserRole.Manager, name: department.managerName, hospitalId: hospital.id, departmentId: department.id };
            }

            // Check for Staff
            for (const staff of department.staff) {
                if (staff.nationalId === nationalId && staff.password === password) {
                    return { role: UserRole.Staff, name: staff.name, hospitalId: hospital.id, departmentId: department.id, staffId: staff.id };
                }
            }
            
            // Check for Patient
            if (department.patients) {
                for (const patient of department.patients) {
                    if (patient.nationalId === nationalId && patient.password === password) {
                        return { role: UserRole.Patient, name: patient.name, hospitalId: hospital.id, departmentId: department.id, patientId: patient.id };
                    }
                }
            }
        }
    }

    return null; // User not found
};


// --- File Storage (using Supabase Storage & IndexedDB for cache) ---

const FILE_BUCKET = 'training_materials';

// Helper to get public URL for a file
const getFileUrl = (filePath: string) => {
    const { data } = supabase.storage.from(FILE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
}

export const addMaterial = async (material: { id: string; data: string; type: string; name: string }): Promise<string> => {
    const fileExt = material.name.split('.').pop();
    const filePath = `${Date.now()}-${material.id}.${fileExt}`;

    // Convert base64 to blob
    const res = await fetch(material.data);
    const blob = await res.blob();
    
    const { error } = await supabase.storage
        .from(FILE_BUCKET)
        .upload(filePath, blob, { contentType: material.type });
    
    if (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
    
    // Cache the file locally using its public URL as ID for simplicity
    await db.files.put({ id: getFileUrl(filePath), data: material.data });

    return filePath; // Return the path for storage in the hospital JSON
};


export const getMaterialData = async (filePath: string): Promise<string | undefined> => {
    const publicUrl = getFileUrl(filePath);

    // Try to get from local cache first
    const localFile = await db.files.get(publicUrl);
    if (localFile) return localFile.data;
    
    // If not in cache, fetch from Supabase and cache it
    try {
        const response = await fetch(publicUrl);
        if (!response.ok) throw new Error('File not found in Supabase.');

        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.onerror = err => reject(err);
            reader.readAsDataURL(blob);
        });
        
        // Add to cache for next time
        await db.files.put({ id: publicUrl, data: dataUrl });

        return dataUrl;
    } catch (error) {
        console.error("Error fetching material from Supabase:", error);
        return undefined;
    }
};

export const deleteMaterial = async (filePath: string): Promise<void> => {
    // Delete from Supabase Storage
    const { error } = await supabase.storage.from(FILE_BUCKET).remove([filePath]);
    if (error) console.error("Error deleting from Supabase Storage:", error);

    // Delete from local cache
    const publicUrl = getFileUrl(filePath);
    await db.files.delete(publicUrl);
};


// Note: The functions below are placeholders for saving/loading entire database dumps.
// In a real Supabase app, this is less common, but retained for feature parity.
export const getAllMaterials = (): Promise<{id: string, data: string}[]> => {
    return db.files.toArray();
};

export const clearAllMaterials = (): Promise<void> => {
     return db.files.clear();
}

// --- Real-time Subscriptions ---
export const onHospitalsChange = (callback: (updatedHospitals: Hospital[]) => void) => {
    const channel = supabase
        .channel('hospitals-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitals' },
        async (payload) => {
            console.log('Change received!', payload);
            // Refetch all data on any change to ensure consistency
            const freshData = await syncHospitalsWithSupabase();
            callback(freshData);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};