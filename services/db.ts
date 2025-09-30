import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Dexie, { Table } from 'dexie';
import { Hospital, Department, StaffMember, Assessment, NamedChecklistTemplate, ExamTemplate, TrainingMaterial, MonthlyTraining, NewsBanner, Patient, AdminMessage, MonthlyNeedsAssessment, LoggedInUser, UserRole } from '../types';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://mafgyafugqazpnnvlrls.supabase.co';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZmd5YWZ1Z3FhenBubnZscmxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNzU2NTcsImV4cCI6MjA3Mjg1MTY1N30.eo_qHukJ9DhQyvrL9WJvgDaxLRNQzae7Q0jJgZaoXXA';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// --- Local Database (Dexie) ---
export const db = new Dexie('SkillAssessmentDB_v3') as Dexie & {
  hospitals: Table<Hospital, string>;
  files: Table<{ id: string; data: string }, string>;
};

db.version(1).stores({
  hospitals: 'id',
  files: 'id',
});


// --- Data Sync and Management ---
// This is now the core function for fetching and assembling data
export const syncAndAssembleData = async (): Promise<Hospital[]> => {
    try {
        console.log("Starting data sync from Supabase...");

        // 1. Fetch all data from all tables in parallel
        const [
            hospitalsRes, departmentsRes, staffRes, assessmentsRes, 
            checklistTemplatesRes, examTemplatesRes, trainingMaterialsRes, 
            accreditationMaterialsRes, newsBannersRes, patientsRes, 
            adminMessagesRes, needsAssessmentsRes
        ] = await Promise.all([
            supabase.from('hospitals').select('*'),
            supabase.from('departments').select('*'),
            supabase.from('staff').select('*'),
            supabase.from('assessments').select('*'),
            supabase.from('checklist_templates').select('*'),
            supabase.from('exam_templates').select('*'),
            supabase.from('training_materials').select('*'),
            supabase.from('accreditation_materials').select('*'),
            supabase.from('news_banners').select('*'),
            supabase.from('patients').select('*'),
            supabase.from('admin_messages').select('*'),
            supabase.from('needs_assessments').select('*'),
        ]);

        // Error handling for all fetches
        const responses = { hospitalsRes, departmentsRes, staffRes, assessmentsRes, checklistTemplatesRes, examTemplatesRes, trainingMaterialsRes, accreditationMaterialsRes, newsBannersRes, patientsRes, adminMessagesRes, needsAssessmentsRes };
        for (const [key, res] of Object.entries(responses)) {
            if (res.error) {
                console.error(`Error fetching ${key}:`, res.error);
                throw res.error;
            }
        }
        
        console.log("All data fetched successfully. Assembling client-side structure...");

        // 2. Extract data
        const hospitals: Hospital[] = hospitalsRes.data || [];
        const departments: (Department & { hospital_id: string })[] = departmentsRes.data || [];
        const staff: (StaffMember & { department_id: string })[] = staffRes.data || [];
        const assessments: (Assessment & { staff_id: string })[] = assessmentsRes.data || [];
        const checklistTemplates: (NamedChecklistTemplate & { hospital_id: string })[] = checklistTemplatesRes.data || [];
        const examTemplates: (ExamTemplate & { hospital_id: string })[] = examTemplatesRes.data || [];
        const trainingMaterials: (MonthlyTraining & { hospital_id: string })[] = trainingMaterialsRes.data || [];
        const accreditationMaterials: (TrainingMaterial & { hospital_id: string })[] = accreditationMaterialsRes.data || [];
        const newsBanners: (NewsBanner & { hospital_id: string })[] = newsBannersRes.data || [];
        const patients: (Patient & { department_id: string })[] = patientsRes.data || [];
        const adminMessages: (AdminMessage & { hospital_id: string })[] = adminMessagesRes.data || [];
        const needsAssessments: (MonthlyNeedsAssessment & { hospital_id: string })[] = needsAssessmentsRes.data || [];

        // 3. Assemble the nested structure
        hospitals.forEach(h => {
            h.departments = departments.filter(d => d.hospital_id === h.id);
            h.checklistTemplates = checklistTemplates.filter(t => t.hospital_id === h.id);
            h.examTemplates = examTemplates.filter(t => t.hospital_id === h.id);
            h.trainingMaterials = trainingMaterials.filter(t => t.hospital_id === h.id);
            h.accreditationMaterials = accreditationMaterials.filter(m => m.hospital_id === h.id);
            h.newsBanners = newsBanners.filter(b => b.hospital_id === h.id);
            h.adminMessages = adminMessages.filter(m => m.hospital_id === h.id);
            h.needsAssessments = needsAssessments.filter(n => n.hospital_id === h.id);
            
            h.departments.forEach(d => {
                d.staff = staff.filter(s => s.department_id === d.id);
                d.patients = patients.filter(p => p.department_id === d.id);
                
                d.staff.forEach(s => {
                    s.assessments = assessments.filter(a => a.staff_id === s.id);
                });
            });
        });

        console.log("Assembly complete. Updating local database.");
        // Update local cache
        await db.hospitals.clear();
        await db.hospitals.bulkPut(hospitals);
        
        return hospitals;
    } catch (error) {
        console.error("Critical error during data sync and assembly:", error);
        // Fallback to local data if sync fails
        return db.hospitals.toArray();
    }
};

// --- Granular CRUD Functions ---

// HOSPITAL
export const upsertHospital = async (hospital: Partial<Hospital>) => {
    const { departments, ...hospitalData } = hospital; // Exclude nested arrays
    const { error } = await supabase.from('hospitals').upsert(hospitalData);
    if (error) console.error("upsertHospital error:", error);
};

export const deleteHospital = async (hospitalId: string) => {
    const { error } = await supabase.from('hospitals').delete().eq('id', hospitalId);
    if (error) console.error("deleteHospital error:", error);
};

// DEPARTMENT
export const upsertDepartment = async (department: Department, hospitalId: string) => {
    const { staff, patients, patientEducationMaterials, ...deptData } = department;
    const payload = { ...deptData, hospital_id: hospitalId };
    const { error } = await supabase.from('departments').upsert(payload);
    if (error) console.error("upsertDepartment error:", error);
};

export const deleteDepartment = async (departmentId: string) => {
    const { error } = await supabase.from('departments').delete().eq('id', departmentId);
    if (error) console.error("deleteDepartment error:", error);
};

// STAFF
export const upsertStaff = async (staff: StaffMember, departmentId: string) => {
    const { assessments, workLogs, ...staffData } = staff;
    const payload = { ...staffData, department_id: departmentId };
    const { error } = await supabase.from('staff').upsert(payload);
    if (error) console.error("upsertStaff error:", error);
};

export const deleteStaff = async (staffId: string) => {
    const { error } = await supabase.from('staff').delete().eq('id', staffId);
    if (error) console.error("deleteStaff error:", error);
};

// ASSESSMENT
export const upsertAssessment = async (assessment: Assessment, staffId: string) => {
    const payload = { ...assessment, staff_id: staffId };
    const { error } = await supabase.from('assessments').upsert(payload);
    if (error) console.error("upsertAssessment error:", error);
};

// CHECKLIST TEMPLATE
export const upsertChecklistTemplate = async (template: NamedChecklistTemplate, hospitalId: string) => {
    const payload = { ...template, hospital_id: hospitalId };
    const { error } = await supabase.from('checklist_templates').upsert(payload);
    if (error) console.error("upsertChecklistTemplate error:", error);
}

export const deleteChecklistTemplate = async (templateId: string) => {
    const { error } = await supabase.from('checklist_templates').delete().eq('id', templateId);
    if (error) console.error("deleteChecklistTemplate error:", error);
}

// And so on for every other data type... (Exam, Training, Patient, etc.)

// --- Real-time Subscription ---
export const onRemoteChange = (callback: () => void) => {
    const channel = supabase
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' },
        (payload) => {
            console.log('Remote change detected:', payload, "Refetching all data.");
            callback();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

// --- Auth ---
const ADMIN_NATIONAL_ID = (import.meta as any).env.VITE_ADMIN_NATIONAL_ID || '5850008985';
const ADMIN_PASSWORD = (import.meta as any).env.VITE_ADMIN_PASSWORD || '64546';

export const findUser = (hospitals: Hospital[], nationalId: string, password: string): LoggedInUser | null => {
    // ... (rest of the findUser function remains the same as it operates on the assembled data)
    if (nationalId === ADMIN_NATIONAL_ID && password === ADMIN_PASSWORD) {
        return { role: UserRole.Admin, name: 'ادمین کل' };
    }
    for (const hospital of hospitals) {
        if (hospital.supervisorNationalId === nationalId && hospital.supervisorPassword === password) {
            return { role: UserRole.Supervisor, name: hospital.supervisorName || 'سوپروایزر', hospitalId: hospital.id };
        }
        for (const department of hospital.departments) {
            if (department.managerNationalId === nationalId && department.managerPassword === password) {
                return { role: UserRole.Manager, name: department.managerName, hospitalId: hospital.id, departmentId: department.id };
            }
            for (const staff of department.staff) {
                if (staff.nationalId === nationalId && staff.password === password) {
                    return { role: UserRole.Staff, name: staff.name, hospitalId: hospital.id, departmentId: department.id, staffId: staff.id };
                }
            }
            if (department.patients) {
                for (const patient of department.patients) {
                    if (patient.nationalId === nationalId && patient.password === password) {
                        return { role: UserRole.Patient, name: patient.name, hospitalId: hospital.id, departmentId: department.id, patientId: patient.id };
                    }
                }
            }
        }
    }
    return null;
};

// --- FILE STORAGE (No changes needed here, it was already well-designed) ---
// ... file storage functions (addMaterial, getMaterialData, deleteMaterial) remain the same ...
const FILE_BUCKET = 'training_materials';
const getFileUrl = (filePath: string) => supabase.storage.from(FILE_BUCKET).getPublicUrl(filePath).data.publicUrl;
export const addMaterial = async (material: { id: string; data: string; type: string; name: string }): Promise<string> => {
    const fileExt = material.name.split('.').pop();
    const filePath = `${Date.now()}-${material.id}.${fileExt}`;
    const res = await fetch(material.data);
    const blob = await res.blob();
    const { error } = await supabase.storage.from(FILE_BUCKET).upload(filePath, blob, { contentType: material.type });
    if (error) { console.error('Error uploading file:', error); throw error; }
    await db.files.put({ id: getFileUrl(filePath), data: material.data });
    return filePath;
};
export const getMaterialData = async (filePath: string): Promise<string | undefined> => {
    const publicUrl = getFileUrl(filePath);
    const localFile = await db.files.get(publicUrl);
    if (localFile) return localFile.data;
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
        await db.files.put({ id: publicUrl, data: dataUrl });
        return dataUrl;
    } catch (error) {
        console.error("Error fetching material from Supabase:", error);
        return undefined;
    }
};
export const deleteMaterial = async (filePath: string): Promise<void> => {
    const { error } = await supabase.storage.from(FILE_BUCKET).remove([filePath]);
    if (error) console.error("Error deleting from Supabase Storage:", error);
    await db.files.delete(getFileUrl(filePath));
};
export const getAllMaterials = (): Promise<{id: string, data: string}[]> => db.files.toArray();
export const clearAllMaterials = (): Promise<void> => db.files.clear();
