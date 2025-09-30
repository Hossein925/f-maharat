import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Dexie, { Table } from 'dexie';
import { Hospital, Department, StaffMember, Assessment, NamedChecklistTemplate, ExamTemplate, TrainingMaterial, MonthlyTraining, NewsBanner, Patient, AdminMessage, MonthlyNeedsAssessment, LoggedInUser, UserRole, MonthlyWorkLog } from '../types';

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

// --- CASE CONVERSION HELPERS ---
const isObject = (obj: any): boolean => obj === Object(obj) && !Array.isArray(obj) && typeof obj !== 'function';

const toCamel = (s: string): string => s.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace(/[_-]/, ''));
const keysToCamel = (obj: any): any => {
  if (isObject(obj)) {
    const n: { [key: string]: any } = {};
    Object.keys(obj).forEach((k) => { n[toCamel(k)] = keysToCamel(obj[k]); });
    return n;
  } else if (Array.isArray(obj)) {
    return obj.map((i) => keysToCamel(i));
  }
  return obj;
};

const toSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const keysToSnake = (obj: any): any => {
    if (isObject(obj)) {
        const n: { [key: string]: any } = {};
        Object.keys(obj).forEach((k) => { n[toSnake(k)] = keysToSnake(obj[k]); });
        return n;
    } else if (Array.isArray(obj)) {
        return obj.map((i) => keysToSnake(i));
    }
    return obj;
};

// Helper to remove nested arrays before sending to Supabase
const stripNestedArrays = (obj: any): any => {
    const newObj = { ...obj };
    for (const key in newObj) {
        if (Array.isArray(newObj[key])) {
            if (newObj[key].length > 0 && typeof newObj[key][0] === 'object' && newObj[key][0] !== null && 'id' in newObj[key][0]) {
                delete newObj[key];
            }
        }
    }
    return newObj;
};

// --- Data Sync and Management ---
export const syncAndAssembleData = async (): Promise<Hospital[]> => {
    try {
        console.log("Starting data sync from Supabase...");

        const [
            hospitalsRes, departmentsRes, staffRes, assessmentsRes, 
            checklistTemplatesRes, examTemplatesRes, trainingMaterialsRes, 
            accreditationMaterialsRes, newsBannersRes, patientsRes, 
            adminMessagesRes, needsAssessmentsRes, workLogsRes
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
            supabase.from('work_logs').select('*'),
        ]);

        const responses = { hospitalsRes, departmentsRes, staffRes, assessmentsRes, checklistTemplatesRes, examTemplatesRes, trainingMaterialsRes, accreditationMaterialsRes, newsBannersRes, patientsRes, adminMessagesRes, needsAssessmentsRes, workLogsRes };
        for (const [key, res] of Object.entries(responses)) {
            if (res.error) {
                console.error(`Error fetching ${key}:`, res.error);
                throw res.error;
            }
        }
        
        console.log("All data fetched successfully. Converting keys and assembling structure...");

        const hospitals: Hospital[] = keysToCamel(hospitalsRes.data || []);
        const departments: (Department & { hospitalId: string })[] = keysToCamel(departmentsRes.data || []);
        const staff: (StaffMember & { departmentId: string })[] = keysToCamel(staffRes.data || []);
        const assessments: (Assessment & { staffId: string })[] = keysToCamel(assessmentsRes.data || []);
        const workLogs: (MonthlyWorkLog & { staffId: string })[] = keysToCamel(workLogsRes.data || []);
        const checklistTemplates: (NamedChecklistTemplate & { hospitalId: string })[] = keysToCamel(checklistTemplatesRes.data || []);
        const examTemplates: (ExamTemplate & { hospitalId: string })[] = keysToCamel(examTemplatesRes.data || []);
        const trainingMaterials: (MonthlyTraining & { hospitalId: string })[] = keysToCamel(trainingMaterialsRes.data || []);
        const accreditationMaterials: (TrainingMaterial & { hospitalId: string })[] = keysToCamel(accreditationMaterialsRes.data || []);
        const newsBanners: (NewsBanner & { hospitalId: string })[] = keysToCamel(newsBannersRes.data || []);
        const patients: (Patient & { departmentId: string })[] = keysToCamel(patientsRes.data || []);
        const adminMessages: (AdminMessage & { hospitalId: string })[] = keysToCamel(adminMessagesRes.data || []);
        const needsAssessments: (MonthlyNeedsAssessment & { hospitalId: string })[] = keysToCamel(needsAssessmentsRes.data || []);

        hospitals.forEach(h => {
            h.departments = departments.filter(d => d.hospitalId === h.id);
            h.checklistTemplates = checklistTemplates.filter(t => t.hospitalId === h.id);
            h.examTemplates = examTemplates.filter(t => t.hospitalId === h.id);
            h.trainingMaterials = trainingMaterials.filter(t => t.hospitalId === h.id);
            h.accreditationMaterials = accreditationMaterials.filter(m => m.hospitalId === h.id);
            h.newsBanners = newsBanners.filter(b => b.hospitalId === h.id);
            h.adminMessages = adminMessages.filter(m => m.hospitalId === h.id);
            h.needsAssessments = needsAssessments.filter(n => n.hospitalId === h.id);
            
            h.departments.forEach(d => {
                d.staff = staff.filter(s => s.departmentId === d.id);
                d.patients = patients.filter(p => p.departmentId === d.id);
                
                d.staff.forEach(s => {
                    s.assessments = assessments.filter(a => a.staffId === s.id);
                    s.workLogs = workLogs.filter(wl => wl.staffId === s.id);
                });
            });
        });

        await db.hospitals.clear();
        await db.hospitals.bulkPut(hospitals);
        
        return hospitals;
    } catch (error) {
        console.error("Critical error during data sync:", error);
        return db.hospitals.toArray();
    }
};

// --- Granular CRUD Functions ---

export const upsertHospital = async (hospital: Partial<Hospital>) => {
    const flatData = stripNestedArrays(hospital);
    const { error } = await supabase.from('hospitals').upsert(keysToSnake(flatData));
    if (error) throw error;
};
export const deleteHospital = async (id: string) => {
    const { error } = await supabase.from('hospitals').delete().eq('id', id);
    if (error) throw error;
};

export const upsertDepartment = async (department: Partial<Department>, hospitalId: string) => {
    const flatData = stripNestedArrays(department);
    const { error } = await supabase.from('departments').upsert(keysToSnake({ ...flatData, hospitalId }));
    if (error) throw error;
};
export const deleteDepartment = async (id: string) => {
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) throw error;
};

export const upsertStaff = async (staff: Partial<StaffMember>, departmentId: string) => {
    const flatData = stripNestedArrays(staff);
    const { error } = await supabase.from('staff').upsert(keysToSnake({ ...flatData, departmentId }));
    if (error) throw error;
};
export const deleteStaff = async (id: string) => {
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) throw error;
};

export const upsertAssessment = async (assessment: Partial<Assessment>, staffId: string) => {
    const flatData = stripNestedArrays(assessment);
    const { error } = await supabase.from('assessments').upsert(keysToSnake({ ...flatData, staffId }));
    if (error) throw error;
};
// Add more upsert/delete functions for other types as needed...

// --- Auth ---
export const findUser = (hospitals: Hospital[], nationalId: string, password: string): LoggedInUser | null => {
  if (nationalId === 'admin' && password === 'admin') {
    return { role: UserRole.Admin, name: 'Admin' };
  }
  for (const hospital of hospitals) {
    if (hospital.supervisorNationalId === nationalId && hospital.supervisorPassword === password) {
      return { role: UserRole.Supervisor, name: hospital.supervisorName || 'Supervisor', hospitalId: hospital.id };
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
      for (const patient of department.patients || []) {
        if (patient.nationalId === nationalId && patient.password === password) {
            return { role: UserRole.Patient, name: patient.name, hospitalId: hospital.id, departmentId: department.id, patientId: patient.id };
        }
      }
    }
  }
  return null;
};

// --- Realtime ---
export const onRemoteChange = (callback: () => void): (() => Promise<"ok" | "error">) => {
  const subscription = supabase.channel('public-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
      console.log('Remote change received, refreshing data.', payload);
      callback();
    })
    .subscribe();
    
  // Fix: Handle the 'timed out' case from `unsubscribe` to match the return type.
  return async () => {
    const result = await subscription.unsubscribe();
    if (result === 'timed out') {
      console.warn('Supabase subscription unsubscribe timed out.');
      return 'error';
    }
    return result;
  };
};

// --- Local File Storage (Dexie) ---
export const addMaterial = async (material: { id: string; data: string; name: string; type: string; }): Promise<string> => {
    await db.files.put({ id: material.id, data: material.data });
    return material.id;
};

export const getMaterialData = async (id: string): Promise<string | null> => {
    const file = await db.files.get(id);
    return file?.data || null;
};

export const deleteMaterialData = async (id: string): Promise<void> => {
    await db.files.delete(id);
};

export const getAllMaterials = async (): Promise<{id: string; data: string}[]> => {
    return db.files.toArray();
};

export const clearAllMaterials = async (): Promise<void> => {
    await db.files.clear();
};
