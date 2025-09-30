import React, { useState, useEffect, useCallback } from 'react';
import { Department, StaffMember, View, SkillCategory, Assessment, Hospital, AppScreen, NamedChecklistTemplate, ExamTemplate, ExamSubmission, LoggedInUser, UserRole, TrainingMaterial, MonthlyTraining, NewsBanner, MonthlyWorkLog, Patient, ChatMessage, AdminMessage, NeedsAssessmentTopic, MonthlyNeedsAssessment } from './types';
import WelcomeScreen from './components/WelcomeScreen';
import HospitalList from './components/HospitalList';
import DepartmentList from './components/DepartmentList';
import DepartmentView from './components/DepartmentView';
import StaffMemberView from './components/StaffMemberView';
import ChecklistManager from './components/ChecklistManager';
import ExamManager from './components/ExamManager';
import TrainingManager from './components/TrainingManager';
import AccreditationManager from './components/AccreditationManager';
import NewsBannerManager from './components/NewsBannerManager';
import PatientEducationManager from './components/PatientEducationManager';
import PatientPortalView from './components/PatientPortalView';
import AboutModal from './components/AboutModal';
import LoginModal from './components/LoginModal';
import { SaveIcon } from './components/icons/SaveIcon';
import { UploadIcon } from './components/icons/UploadIcon';
import { InfoIcon } from './components/icons/InfoIcon';
import { LogoutIcon } from './components/icons/LogoutIcon';
import { BackIcon } from './components/icons/BackIcon';
import * as db from './services/db';
import AdminCommunicationView from './components/AdminCommunicationView';
import HospitalCommunicationView from './components/HospitalCommunicationView';
import NeedsAssessmentManager from './components/NeedsAssessmentManager';

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد",
  "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر",
  "دی", "بهمن", "اسفند"
];

type MessageContent = { text?: string; file?: { id: string; name: string; type: string } };

const getCurrentJalaliYear = () => {
    try {
        return parseInt(new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/')[0], 10);
    } catch {
        return new Date().getFullYear() - 621;
    }
};

const App: React.FC = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [appScreen, setAppScreen] = useState<AppScreen>(AppScreen.Welcome);
  const [currentView, setCurrentView] = useState<View>(View.DepartmentList);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  
  const [activeYear, setActiveYear] = useState<number>(getCurrentJalaliYear());

  // --- Data Initialization and Real-time Sync ---
  useEffect(() => {
    const initializeData = async () => {
        setIsLoading(true);
        // Load local data first for a snappy UI, then sync with remote.
        const localData = await db.getLocalHospitals();
        setHospitals(localData);
        console.log("Local data loaded. Syncing with Supabase...");
        const remoteData = await db.syncHospitalsWithSupabase();
        setHospitals(remoteData);
        console.log("Sync complete.");
        setIsLoading(false);
    };
    initializeData();

    const unsubscribe = db.onHospitalsChange((updatedHospitals) => {
        console.log("Real-time update received. Refreshing data.");
        setHospitals(updatedHospitals);
    });

    return () => {
        unsubscribe();
    };
}, []);

  const getAvailableYears = (allHospitals: Hospital[]): number[] => {
    const years = new Set<number>([getCurrentJalaliYear()]);
    allHospitals.forEach(h => {
        h.departments.forEach(d => {
            d.staff.forEach(s => {
                s.assessments.forEach(a => { if (a.year) years.add(a.year) });
                s.workLogs?.forEach(wl => { if (wl.year) years.add(wl.year) });
            });
        });
        h.needsAssessments?.forEach(na => { if (na.year) years.add(na.year) });
    });
    return Array.from(years).sort((a, b) => b - a);
  };
  
  const allAvailableYears = getAvailableYears(hospitals);
  
  const handleGoToWelcome = () => {
    setAppScreen(AppScreen.Welcome);
    setSelectedHospitalId(null);
    setSelectedDepartmentId(null);
    setSelectedStaffId(null);
    setCurrentView(View.DepartmentList);
    setLoggedInUser(null);
  }

  const findHospital = (hospitalId: string | null) => hospitals.find(h => h.id === hospitalId);
  const findDepartment = (hospital: Hospital | undefined, departmentId: string | null) => hospital?.departments.find(d => d.id === departmentId);
  const findStaffMember = (department: Department | undefined, staffId: string | null) => department?.staff.find(s => s.id === staffId);

  // --- Data Handlers for JSON import/export ---
  const handleSaveData = async () => {
      const allFiles = await db.getAllMaterials();
      const dataToSave = { type: 'full_backup', hospitals, files: allFiles };
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(dataToSave, null, 2))}`;
      const link = document.createElement('a');
      link.href = jsonString;
      link.download = `skill_assessment_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
  };

  const handleLoadData = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = async (e) => {
              try {
                  const text = e.target?.result as string;
                  const loadedData = JSON.parse(text);
                  const hospitalsToLoad = loadedData.hospitals as Hospital[];
                  const filesToLoad = loadedData.files as {id: string, data: string}[];

                  if (window.confirm('آیا مطمئن هستید که می‌خواهید تمام داده‌های فعلی را با اطلاعات این فایل جایگزین کنید؟ این عمل غیرقابل بازگشت است.')) {
                      await db.db.files.clear();
                      if(filesToLoad) await db.db.files.bulkPut(filesToLoad);

                      for (const hospital of hospitals) {
                          await db.deleteHospitalById(hospital.id);
                      }
                      for (const hospital of hospitalsToLoad) {
                          await db.upsertHospital(hospital);
                      }
                      setHospitals(hospitalsToLoad);
                      alert('داده‌ها با موفقیت بارگذاری شد.');
                  }
              } catch (error) {
                  alert('خطا در بارگذاری فایل. فرمت فایل نامعتبر است.');
              }
          };
          reader.readAsText(file);
      }
  };


  // --- Navigation Handlers ---
  const handleSelectHospital = (id: string) => {
    setSelectedHospitalId(id);
    setAppScreen(AppScreen.MainApp);
    setCurrentView(View.DepartmentList);
  };

  const handleSelectDepartment = (id: string) => {
    setSelectedDepartmentId(id);
    setCurrentView(View.DepartmentView);
  };

  const handleSelectStaff = (id: string) => {
    setSelectedStaffId(id);
    setCurrentView(View.StaffMemberView);
  };

  const handleBack = () => {
    if (!loggedInUser) {
        handleLogout();
        return;
    }
    switch (currentView) {
      case View.StaffMemberView:
        if (loggedInUser.role === UserRole.Staff) {
            handleLogout();
            return;
        }
        setSelectedStaffId(null);
        setCurrentView(View.DepartmentView);
        break;
      case View.ChecklistManager:
      case View.ExamManager:
      case View.TrainingManager:
      case View.PatientEducationManager:
        setCurrentView(View.DepartmentView);
        break;
      case View.DepartmentView:
        if (loggedInUser.role === UserRole.Manager) {
            handleLogout();
            return;
        }
        setSelectedDepartmentId(null);
        setCurrentView(View.DepartmentList);
        break;
      case View.AccreditationManager:
      case View.NewsBannerManager:
      case View.HospitalCommunication:
      case View.AdminCommunication:
      case View.NeedsAssessmentManager:
        setSelectedDepartmentId(null);
        setCurrentView(View.DepartmentList);
        break;
      case View.DepartmentList:
         if (loggedInUser.role === UserRole.Supervisor) {
            handleLogout();
            return;
        }
        setSelectedHospitalId(null);
        if (loggedInUser.role === UserRole.Admin) {
            setAppScreen(AppScreen.HospitalList);
        } else {
            handleLogout();
        }
        break;
    }
  };

  const updateAndSyncHospital = (hospitalId: string, updateFn: (hospital: Hospital) => Hospital) => {
    const updatedHospitals = hospitals.map(h => {
        if (h.id === hospitalId) {
            // Use a deep copy to ensure we trigger re-renders and don't mutate state directly
            const hospitalToUpdate = JSON.parse(JSON.stringify(h));
            return updateFn(hospitalToUpdate);
        }
        return h;
    });
    setHospitals(updatedHospitals);

    const hospitalToSync = updatedHospitals.find(h => h.id === hospitalId);
    if (hospitalToSync) {
        db.upsertHospital(hospitalToSync);
    }
  };

  // --- Year Archiving ---
  const handleArchiveYear = (yearToArchive: number) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, (hospital) => {
        hospital.departments.forEach((department: Department) => {
            department.staff.forEach((staff: StaffMember) => {
                staff.assessments.forEach((assessment: Assessment) => {
                    if (assessment.year === undefined || assessment.year === null) {
                        assessment.year = yearToArchive;
                    }
                });
                if (staff.workLogs) {
                    staff.workLogs.forEach((workLog: MonthlyWorkLog) => {
                         if (workLog.year === undefined || workLog.year === null) {
                            workLog.year = yearToArchive;
                        }
                    });
                }
            });
        });
        if (hospital.needsAssessments) {
             hospital.needsAssessments.forEach((na: MonthlyNeedsAssessment) => {
                if (na.year === undefined || na.year === null) {
                    na.year = yearToArchive;
                }
            });
        }
        return hospital;
    });
    setActiveYear(yearToArchive + 1);
  };

  // --- Hospital Handlers ---
  const handleAddHospital = async (name: string, province: string, city: string, supervisorName: string, supervisorNationalId: string, supervisorPassword: string) => {
    const newHospital: Hospital = {
      id: Date.now().toString(), name, province, city, supervisorName, supervisorNationalId, supervisorPassword,
      departments: [], checklistTemplates: [], examTemplates: [], trainingMaterials: [],
      accreditationMaterials: [], newsBanners: [], adminMessages: [], needsAssessments: [],
    };
    await db.upsertHospital(newHospital);
    setHospitals([...hospitals, newHospital]);
  };

  const handleUpdateHospital = (id: string, updatedData: Partial<Omit<Hospital, 'id' | 'departments'>>) => {
      const hospital = findHospital(id);
      if (hospital) {
          const updatedHospital = { ...hospital, ...updatedData };
          db.upsertHospital(updatedHospital);
          setHospitals(hospitals.map(h => h.id === id ? updatedHospital : h));
      }
  }

  const handleDeleteHospital = (id: string) => {
    db.deleteHospitalById(id);
    setHospitals(hospitals.filter(h => h.id !== id));
  };
  
  const handleAddDepartment = (name: string, managerName: string, managerNationalId: string, managerPassword: string, staffCount: number, bedCount: number) => {
    if (!selectedHospitalId) return;
    const newDepartment: Department = { id: Date.now().toString(), name, managerName, managerNationalId, managerPassword, staffCount, bedCount, staff: [] };
    updateAndSyncHospital(selectedHospitalId, hospital => {
        hospital.departments.push(newDepartment);
        return hospital;
    });
  };

  const handleUpdateDepartment = (id: string, updatedData: Partial<Omit<Department, 'id' | 'staff'>>) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        hospital.departments = hospital.departments.map(d => d.id === id ? { ...d, ...updatedData } : d);
        return hospital;
    });
  }

  const handleDeleteDepartment = (id: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        hospital.departments = hospital.departments.filter(d => d.id !== id);
        return hospital;
    });
  };
  
  const handleAddStaff = (departmentId: string, name: string, title: string, nationalId: string, password?: string) => {
    if (!selectedHospitalId) return;
    const newStaff: StaffMember = { id: Date.now().toString(), name, title, nationalId, password, assessments: [] };
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        if (department) department.staff.push(newStaff);
        return hospital;
    });
  };

  const handleUpdateStaff = (departmentId: string, staffId: string, updatedData: Partial<Omit<StaffMember, 'id' | 'assessments'>>) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        if (department) {
            department.staff = department.staff.map(s => s.id === staffId ? { ...s, ...updatedData } : s);
        }
        return hospital;
    });
  };

  const handleDeleteStaff = (departmentId: string, staffId: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        if (department) {
            department.staff = department.staff.filter(s => s.id !== staffId);
        }
        return hospital;
    });
  };

   const handleAddOrUpdateAssessment = (departmentId: string, staffId: string, month: string, year: number, skills: SkillCategory[], template?: Partial<NamedChecklistTemplate>) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        const staff = department?.staff.find(s => s.id === staffId);
        if (staff) {
            const existingIdx = staff.assessments.findIndex(a => a.month === month && a.year === year);
            const newAssessment: Assessment = {
                id: existingIdx > -1 ? staff.assessments[existingIdx].id : Date.now().toString(),
                month, year, skillCategories: skills,
                supervisorMessage: existingIdx > -1 ? staff.assessments[existingIdx].supervisorMessage : '',
                managerMessage: existingIdx > -1 ? staff.assessments[existingIdx].managerMessage : '',
                templateId: template?.id, minScore: template?.minScore, maxScore: template?.maxScore,
                examSubmissions: existingIdx > -1 ? staff.assessments[existingIdx].examSubmissions : [],
            };
            if (existingIdx > -1) staff.assessments[existingIdx] = newAssessment;
            else staff.assessments.push(newAssessment);
        }
        return hospital;
    });
  };
  
  const handleUpdateAssessmentMessages = (departmentId: string, staffId: string, month: string, year: number, messages: { supervisorMessage: string; managerMessage: string; }) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        const staff = department?.staff.find(s => s.id === staffId);
        if (staff) {
            const assessment = staff.assessments.find(a => a.month === month && a.year === year);
            if (assessment) Object.assign(assessment, messages);
        }
        return hospital;
    });
  };

  const handleSubmitExam = (departmentId: string, staffId: string, month: string, year: number, submission: ExamSubmission) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        const staff = department?.staff.find(s => s.id === staffId);
        if (staff) {
            let assessment = staff.assessments.find(a => a.month === month && a.year === year);
            if (!assessment) {
                assessment = { id: Date.now().toString(), month, year, skillCategories: [], examSubmissions: [] };
                staff.assessments.push(assessment);
            }
            if (!assessment.examSubmissions) assessment.examSubmissions = [];
            const existingSubIdx = assessment.examSubmissions.findIndex(s => s.examTemplateId === submission.examTemplateId);
            if (existingSubIdx > -1) assessment.examSubmissions[existingSubIdx] = submission;
            else assessment.examSubmissions.push(submission);
        }
        return hospital;
    });
  };

  const handleAddOrUpdateWorkLog = (departmentId: string, staffId: string, workLog: MonthlyWorkLog) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        const staff = department?.staff.find(s => s.id === staffId);
        if (staff) {
            if (!staff.workLogs) staff.workLogs = [];
            const logIndex = staff.workLogs.findIndex(l => l.month === workLog.month && l.year === workLog.year);
            if (logIndex > -1) staff.workLogs[logIndex] = workLog;
            else staff.workLogs.push(workLog);
        }
        return hospital;
    });
  };

  const handleComprehensiveImport = (departmentId: string, data: { [staffName: string]: Map<string, SkillCategory[]> }) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find((d: Department) => d.id === departmentId);
        if (!department) return hospital;

        for (const staffName in data) {
            const staffAssessments = data[staffName];
            let staffMember = department.staff.find((s: StaffMember) => s.name === staffName);
            if (!staffMember) {
                staffMember = { id: `${Date.now()}-${staffName}`, name: staffName, title: 'پرسنل', assessments: [] };
                department.staff.push(staffMember);
            }

            for (const [month, skillCategories] of staffAssessments.entries()) {
                const year = activeYear;
                const existingIdx = staffMember.assessments.findIndex((a: Assessment) => a.month === month && a.year === year);
                const newAssessment: Assessment = {
                    id: existingIdx > -1 ? staffMember.assessments[existingIdx].id : `${Date.now()}-${month}`,
                    month, year, skillCategories, minScore: 0, maxScore: 4,
                };
                if (existingIdx > -1) {
                    const old = staffMember.assessments[existingIdx];
                    newAssessment.supervisorMessage = old.supervisorMessage;
                    newAssessment.managerMessage = old.managerMessage;
                    newAssessment.examSubmissions = old.examSubmissions;
                    staffMember.assessments[existingIdx] = newAssessment;
                } else {
                    staffMember.assessments.push(newAssessment);
                }
            }
        }
        return hospital;
    });
  };

  const handleAddOrUpdateChecklistTemplate = (template: NamedChecklistTemplate) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (!hospital.checklistTemplates) hospital.checklistTemplates = [];
        const index = hospital.checklistTemplates.findIndex(t => t.id === template.id);
        if (index > -1) hospital.checklistTemplates[index] = template;
        else hospital.checklistTemplates.push(template);
        return hospital;
    });
  };

  const handleDeleteChecklistTemplate = (templateId: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (hospital.checklistTemplates) {
            hospital.checklistTemplates = hospital.checklistTemplates.filter(t => t.id !== templateId);
        }
        return hospital;
    });
  };

  const handleAddOrUpdateExamTemplate = (template: ExamTemplate) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (!hospital.examTemplates) hospital.examTemplates = [];
        const index = hospital.examTemplates.findIndex(t => t.id === template.id);
        if (index > -1) hospital.examTemplates[index] = template;
        else hospital.examTemplates.push(template);
        return hospital;
    });
  };

  const handleDeleteExamTemplate = (templateId: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (hospital.examTemplates) {
            hospital.examTemplates = hospital.examTemplates.filter(t => t.id !== templateId);
        }
        return hospital;
    });
  };

  const handleAddTrainingMaterial = (month: string, material: TrainingMaterial) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (!hospital.trainingMaterials) hospital.trainingMaterials = [];
        let monthTraining = hospital.trainingMaterials.find(t => t.month === month);
        if (monthTraining) {
            monthTraining.materials.push(material);
        } else {
            hospital.trainingMaterials.push({ month, materials: [material] });
        }
        return hospital;
    });
  };

  const handleDeleteTrainingMaterial = (month: string, materialId: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (hospital.trainingMaterials) {
            const monthTraining = hospital.trainingMaterials.find(t => t.month === month);
            if (monthTraining) {
                monthTraining.materials = monthTraining.materials.filter(m => m.id !== materialId);
            }
        }
        return hospital;
    });
  };

  const handleUpdateTrainingMaterialDescription = (month: string, materialId: string, description: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (hospital.trainingMaterials) {
            const monthTraining = hospital.trainingMaterials.find(t => t.month === month);
            const material = monthTraining?.materials.find(m => m.id === materialId);
            if (material) material.description = description;
        }
        return hospital;
    });
  };
  
  const handleAddAccreditationMaterial = (material: TrainingMaterial) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (!hospital.accreditationMaterials) hospital.accreditationMaterials = [];
        hospital.accreditationMaterials.push(material);
        return hospital;
    });
  };

  const handleDeleteAccreditationMaterial = (materialId: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (hospital.accreditationMaterials) {
            hospital.accreditationMaterials = hospital.accreditationMaterials.filter(m => m.id !== materialId);
        }
        return hospital;
    });
  };

  const handleUpdateAccreditationMaterialDescription = (materialId: string, description: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const material = hospital.accreditationMaterials?.find(m => m.id === materialId);
        if (material) material.description = description;
        return hospital;
    });
  };
  
  const handleAddNewsBanner = async (banner: Omit<NewsBanner, 'id' | 'imageId'>, file: File, imageData: string) => {
    if (!selectedHospitalId) return;
    try {
        const imageId = await db.addMaterial({ 
            id: Date.now().toString(), 
            data: imageData, 
            name: file.name, 
            type: file.type 
        });
        const newBanner: NewsBanner = { ...banner, id: Date.now().toString(), imageId };
        updateAndSyncHospital(selectedHospitalId, hospital => {
            if (!hospital.newsBanners) hospital.newsBanners = [];
            hospital.newsBanners.push(newBanner);
            return hospital;
        });
    } catch (error) {
        console.error("Failed to add news banner:", error);
        alert("خطا در بارگذاری بنر خبری. لطفاً اتصال اینترنت خود را بررسی کرده و دوباره تلاش کنید.");
    }
  };

  const handleUpdateNewsBanner = (bannerId: string, title: string, description: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const banner = hospital.newsBanners?.find(b => b.id === bannerId);
        if (banner) {
            banner.title = title;
            banner.description = description;
        }
        return hospital;
    });
  };

  const handleDeleteNewsBanner = (bannerId: string) => {
    if (!selectedHospitalId) return;
    const banner = findHospital(selectedHospitalId)?.newsBanners?.find(b => b.id === bannerId);
    if (banner) db.deleteMaterial(banner.imageId);
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (hospital.newsBanners) {
            hospital.newsBanners = hospital.newsBanners.filter(b => b.id !== bannerId);
        }
        return hospital;
    });
  };

  const handleAddPatient = (departmentId: string, name: string, nationalId: string, password?: string) => {
    if (!selectedHospitalId) return;
    const newPatient: Patient = { id: Date.now().toString(), name, nationalId, password, chatHistory: [] };
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        if (department) {
            if (!department.patients) department.patients = [];
            department.patients.push(newPatient);
        }
        return hospital;
    });
  };

  const handleDeletePatient = (departmentId: string, patientId: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        if (department?.patients) {
            department.patients = department.patients.filter(p => p.id !== patientId);
        }
        return hospital;
    });
  };

  const handleAddPatientEducationMaterial = (departmentId: string, material: TrainingMaterial) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        if (department) {
            if (!department.patientEducationMaterials) department.patientEducationMaterials = [];
            department.patientEducationMaterials.push(material);
        }
        return hospital;
    });
  };

  const handleDeletePatientEducationMaterial = (departmentId: string, materialId: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        if (department?.patientEducationMaterials) {
            department.patientEducationMaterials = department.patientEducationMaterials.filter(m => m.id !== materialId);
        }
        return hospital;
    });
  };

  const handleUpdatePatientEducationMaterialDescription = (departmentId: string, materialId: string, description: string) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        const material = department?.patientEducationMaterials?.find(m => m.id === materialId);
        if (material) material.description = description;
        return hospital;
    });
  };
  
  const handleSendMessageToPatient = (departmentId: string, patientId: string, content: MessageContent, sender: 'patient' | 'manager') => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        const department = hospital.departments.find(d => d.id === departmentId);
        const patient = department?.patients?.find(p => p.id === patientId);
        if (patient) {
            if (!patient.chatHistory) patient.chatHistory = [];
            patient.chatHistory.push({ id: Date.now().toString(), sender, timestamp: new Date().toISOString(), ...content });
        }
        return hospital;
    });
  };

  const handleSendMessageToAdmin = (hospitalId: string, content: MessageContent, sender: 'hospital' | 'admin') => {
    updateAndSyncHospital(hospitalId, hospital => {
        if (!hospital.adminMessages) hospital.adminMessages = [];
        hospital.adminMessages.push({ id: Date.now().toString(), sender, timestamp: new Date().toISOString(), ...content });
        return hospital;
    });
  };
  
  const handleUpdateNeedsAssessmentTopics = (month: string, topics: NeedsAssessmentTopic[]) => {
    if (!selectedHospitalId) return;
    updateAndSyncHospital(selectedHospitalId, hospital => {
        if (!hospital.needsAssessments) hospital.needsAssessments = [];
        const assessmentIndex = hospital.needsAssessments.findIndex(na => na.month === month && na.year === activeYear);
        if (assessmentIndex > -1) {
            hospital.needsAssessments[assessmentIndex].topics = topics;
        } else {
            hospital.needsAssessments.push({ month, year: activeYear, topics: topics });
        }
        return hospital;
    });
  };

  const handleSubmitNeedsAssessmentResponse = (departmentId: string, staffId: string, month: string, year: number, responses: Map<string, string>) => {
    if (!selectedHospitalId) return;
      updateAndSyncHospital(selectedHospitalId, hospital => {
          const monthlyAssessment = hospital.needsAssessments?.find(na => na.month === month && na.year === year);
          const staffMember = hospital.departments.find(d => d.id === departmentId)?.staff.find(s => s.id === staffId);
          if (monthlyAssessment && staffMember) {
            responses.forEach((response, topicId) => {
                const topic = monthlyAssessment.topics.find(t => t.id === topicId);
                if (topic) {
                    const responseIndex = topic.responses.findIndex(r => r.staffId === staffId);
                    const newResponse = { staffId, staffName: staffMember.name, response };
                    if (responseIndex > -1) topic.responses[responseIndex] = newResponse;
                    else topic.responses.push(newResponse);
                }
            });
          }
          return hospital;
      });
  };

  const handleResetHospital = (supervisorNationalId: string, supervisorPassword: string) => {
      const hospital = findHospital(selectedHospitalId);
      if (hospital && hospital.supervisorNationalId === supervisorNationalId && hospital.supervisorPassword === supervisorPassword) {
          updateAndSyncHospital(hospital.id, h => {
              h.departments = [];
              return h;
          });
          return true;
      }
      return false;
  }

  // --- Auth Handlers ---
  const handleLogin = async (nationalId: string, password: string) => {
      setLoginError(null);
      if (!nationalId || !password) { setLoginError('کد ملی و رمز عبور الزامی است.'); return; }
      
      const user = db.findUser(hospitals, nationalId, password);
      
      if(user) {
          setLoggedInUser(user);
          setIsLoginModalOpen(false);

          switch(user.role) {
            case UserRole.Admin:
              setAppScreen(AppScreen.HospitalList);
              break;
            case UserRole.Supervisor:
              handleSelectHospital(user.hospitalId!);
              break;
            case UserRole.Manager:
              handleSelectHospital(user.hospitalId!);
              handleSelectDepartment(user.departmentId!);
              break;
            case UserRole.Staff:
              handleSelectHospital(user.hospitalId!);
              handleSelectDepartment(user.departmentId!);
              handleSelectStaff(user.staffId!);
              break;
            case UserRole.Patient:
              handleSelectHospital(user.hospitalId!);
              setSelectedDepartmentId(user.departmentId!);
              const dept = findHospital(user.hospitalId!)?.departments.find(d => d.id === user.departmentId!);
              const patient = dept?.patients?.find(p => p.id === user.patientId!);
              if(patient) {
                  setAppScreen(AppScreen.MainApp);
                  setCurrentView(View.PatientPortal);
              } else {
                  setLoginError('اطلاعات بیمار یافت نشد.');
              }
              break;
          }
      } else {
          setLoginError('کد ملی یا رمز عبور نامعتبر است.');
      }
  };
  
  const handleLogout = () => {
      setLoggedInUser(null);
      handleGoToWelcome();
  };

  const renderContent = () => {
    if (isLoading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900"><div className="text-center"><p className="text-xl font-semibold text-slate-700 dark:text-slate-300">در حال بارگذاری و همگام‌سازی اطلاعات...</p></div></div>;
    }

    const renderUnauthorized = () => {
        handleLogout();
        return <WelcomeScreen onEnter={() => setIsLoginModalOpen(true)} />;
    };

    if (appScreen === AppScreen.Welcome) {
      return <WelcomeScreen onEnter={() => setIsLoginModalOpen(true)} />;
    }
    
    if (!loggedInUser) {
        return renderUnauthorized();
    }

    if (appScreen === AppScreen.HospitalList) {
      if (loggedInUser.role !== UserRole.Admin) return renderUnauthorized();
      return <HospitalList
        hospitals={hospitals}
        onAddHospital={handleAddHospital}
        onUpdateHospital={handleUpdateHospital}
        onDeleteHospital={handleDeleteHospital}
        onSelectHospital={handleSelectHospital}
        onGoToWelcome={handleGoToWelcome}
        userRole={loggedInUser.role}
        onContactAdmin={() => setCurrentView(View.AdminCommunication)}
      />;
    }

    const selectedHospital = findHospital(selectedHospitalId);
    const selectedDepartment = findDepartment(selectedHospital, selectedDepartmentId);
    const selectedStaffMember = findStaffMember(selectedDepartment, selectedStaffId);

    if (!selectedHospital && appScreen === AppScreen.MainApp && loggedInUser.role !== UserRole.Patient) {
      return <div>Hospital not found.</div>;
    }

    if (currentView === View.PatientPortal) {
        if (loggedInUser.role !== UserRole.Patient) return renderUnauthorized();
        const patientHospital = findHospital(loggedInUser.hospitalId!);
        const patientDepartment = findDepartment(patientHospital, loggedInUser.departmentId!);
        const patientSelf = patientDepartment?.patients?.find(p => p.id === loggedInUser.patientId!);
        if (patientDepartment && patientSelf) {
            return <PatientPortalView
                department={patientDepartment}
                patient={patientSelf}
                onSendMessage={(content) => handleSendMessageToPatient(patientDepartment.id, patientSelf.id, content, 'patient')}
            />
        }
        return <div>Patient data not found.</div>;
    }

    if (!selectedHospital) return <div>Hospital not found error.</div>;

    switch (currentView) {
      case View.DepartmentList:
        if (loggedInUser.role !== UserRole.Admin && loggedInUser.role !== UserRole.Supervisor) return renderUnauthorized();
        return <DepartmentList
          departments={selectedHospital.departments}
          hospitalName={selectedHospital.name}
          onAddDepartment={handleAddDepartment}
          onUpdateDepartment={handleUpdateDepartment}
          onDeleteDepartment={handleDeleteDepartment}
          onSelectDepartment={handleSelectDepartment}
          onBack={handleBack}
          onManageAccreditation={() => setCurrentView(View.AccreditationManager)}
          onManageNewsBanners={() => setCurrentView(View.NewsBannerManager)}
          onManageNeedsAssessment={() => setCurrentView(View.NeedsAssessmentManager)}
          onResetHospital={handleResetHospital}
          onContactAdmin={() => setCurrentView(View.HospitalCommunication)}
          onArchiveYear={handleArchiveYear}
          userRole={loggedInUser!.role}
        />;
      case View.DepartmentView:
        if (![UserRole.Admin, UserRole.Supervisor, UserRole.Manager].includes(loggedInUser.role)) return renderUnauthorized();
        if (!selectedDepartment) return <div>Department not found.</div>;
        return <DepartmentView
          department={selectedDepartment}
          onBack={handleBack}
          onAddStaff={handleAddStaff}
          onUpdateStaff={handleUpdateStaff}
          onDeleteStaff={handleDeleteStaff}
          onSelectStaff={handleSelectStaff}
          onComprehensiveImport={handleComprehensiveImport}
          onManageChecklists={() => setCurrentView(View.ChecklistManager)}
          onManageExams={() => setCurrentView(View.ExamManager)}
          onManageTraining={() => setCurrentView(View.TrainingManager)}
          onManagePatientEducation={() => setCurrentView(View.PatientEducationManager)}
          onAddOrUpdateWorkLog={handleAddOrUpdateWorkLog}
          userRole={loggedInUser!.role}
          newsBanners={selectedHospital.newsBanners || []}
          activeYear={activeYear}
        />;
      case View.StaffMemberView:
        if (![UserRole.Admin, UserRole.Supervisor, UserRole.Manager, UserRole.Staff].includes(loggedInUser.role)) return renderUnauthorized();
        if (!selectedDepartment || !selectedStaffMember) return <div>Staff not found.</div>;
        return <StaffMemberView
          department={selectedDepartment}
          staffMember={selectedStaffMember}
          onBack={handleBack}
          onAddOrUpdateAssessment={handleAddOrUpdateAssessment}
          onUpdateAssessmentMessages={handleUpdateAssessmentMessages}
          onSubmitExam={handleSubmitExam}
          onSubmitNeedsAssessmentResponse={handleSubmitNeedsAssessmentResponse}
          checklistTemplates={selectedHospital.checklistTemplates || []}
          examTemplates={selectedHospital.examTemplates || []}
          trainingMaterials={selectedHospital.trainingMaterials || []}
          accreditationMaterials={selectedHospital.accreditationMaterials || []}
          newsBanners={selectedHospital.newsBanners || []}
          needsAssessments={selectedHospital.needsAssessments || []}
          userRole={loggedInUser!.role}
          activeYear={activeYear}
          availableYears={allAvailableYears}
          onYearChange={setActiveYear}
        />;
      case View.ChecklistManager:
        if (![UserRole.Admin, UserRole.Supervisor, UserRole.Manager].includes(loggedInUser.role)) return renderUnauthorized();
        return <ChecklistManager
          templates={selectedHospital.checklistTemplates || []}
          onAddOrUpdate={handleAddOrUpdateChecklistTemplate}
          onDelete={handleDeleteChecklistTemplate}
          onBack={handleBack}
        />
      case View.ExamManager:
         if (![UserRole.Admin, UserRole.Supervisor, UserRole.Manager].includes(loggedInUser.role)) return renderUnauthorized();
        return <ExamManager
          templates={selectedHospital.examTemplates || []}
          onAddOrUpdate={handleAddOrUpdateExamTemplate}
          onDelete={handleDeleteExamTemplate}
          onBack={handleBack}
        />
      case View.TrainingManager:
        if (![UserRole.Admin, UserRole.Supervisor, UserRole.Manager].includes(loggedInUser.role)) return renderUnauthorized();
        return <TrainingManager
          monthlyTrainings={selectedHospital.trainingMaterials || []}
          onAddMaterial={handleAddTrainingMaterial}
          onDeleteMaterial={handleDeleteTrainingMaterial}
          onUpdateMaterialDescription={handleUpdateTrainingMaterialDescription}
          onBack={handleBack}
        />
      case View.AccreditationManager:
        if (loggedInUser.role !== UserRole.Admin && loggedInUser.role !== UserRole.Supervisor) return renderUnauthorized();
        return <AccreditationManager
          materials={selectedHospital.accreditationMaterials || []}
          onAddMaterial={handleAddAccreditationMaterial}
          onDeleteMaterial={handleDeleteAccreditationMaterial}
          onUpdateMaterialDescription={handleUpdateAccreditationMaterialDescription}
          onBack={handleBack}
        />
      case View.NewsBannerManager:
         if (loggedInUser.role !== UserRole.Admin && loggedInUser.role !== UserRole.Supervisor) return renderUnauthorized();
        return <NewsBannerManager
          banners={selectedHospital.newsBanners || []}
          onAddBanner={handleAddNewsBanner}
          onUpdateBanner={handleUpdateNewsBanner}
          onDeleteBanner={handleDeleteNewsBanner}
          onBack={handleBack}
        />
      case View.PatientEducationManager:
        if (![UserRole.Admin, UserRole.Supervisor, UserRole.Manager].includes(loggedInUser.role)) return renderUnauthorized();
        if (!selectedDepartment) return <div>Department not found.</div>;
        return <PatientEducationManager
          department={selectedDepartment}
          onAddMaterial={(material) => handleAddPatientEducationMaterial(selectedDepartmentId!, material)}
          onDeleteMaterial={(materialId) => handleDeletePatientEducationMaterial(selectedDepartmentId!, materialId)}
          onUpdateMaterialDescription={(materialId, desc) => handleUpdatePatientEducationMaterialDescription(selectedDepartmentId!, materialId, desc)}
          onAddPatient={(name, nationalId, password) => handleAddPatient(selectedDepartmentId!, name, nationalId, password)}
          onDeletePatient={(patientId) => handleDeletePatient(selectedDepartmentId!, patientId)}
          onSendMessage={(patientId, content, sender) => handleSendMessageToPatient(selectedDepartmentId!, patientId, content, sender)}
          onBack={handleBack}
        />
      case View.HospitalCommunication:
        if (loggedInUser.role !== UserRole.Supervisor) return renderUnauthorized();
        return <HospitalCommunicationView
          hospital={selectedHospital}
          onSendMessage={(content) => handleSendMessageToAdmin(selectedHospital.id, content, 'hospital')}
          onBack={handleBack}
        />
      case View.AdminCommunication:
        if (loggedInUser.role !== UserRole.Admin) return renderUnauthorized();
        return <AdminCommunicationView
          hospitals={hospitals}
          onSendMessage={(hospitalId, content) => handleSendMessageToAdmin(hospitalId, content, 'admin')}
          onBack={handleBack}
        />
       case View.NeedsAssessmentManager:
        if (loggedInUser.role !== UserRole.Admin && loggedInUser.role !== UserRole.Supervisor) return renderUnauthorized();
        return <NeedsAssessmentManager
          hospital={selectedHospital}
          onUpdateTopics={handleUpdateNeedsAssessmentTopics}
          onBack={handleBack}
          activeYear={activeYear}
        />
      default:
        return <div>Unhandled view state.</div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        {appScreen !== AppScreen.Welcome && loggedInUser?.role !== UserRole.Patient && (
            <header className="sticky top-0 z-40 bg-gradient-to-r from-purple-600 to-indigo-700 shadow-lg text-white">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      {(loggedInUser && appScreen === AppScreen.MainApp) && (
                          <button onClick={handleBack} className="p-2 rounded-full hover:bg-white/20 transition-colors">
                            <BackIcon className="w-6 h-6"/>
                          </button>
                      )}
                      <h1 className="text-xl font-bold">سامانه بیمارستان من</h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsAboutModalOpen(true)} className="p-2 rounded-full hover:bg-white/20 transition-colors" aria-label="About"><InfoIcon className="w-6 h-6"/></button>
                        {loggedInUser?.role === UserRole.Admin && (
                            <>
                                <button onClick={handleSaveData} className="p-2 rounded-full hover:bg-white/20 transition-colors" aria-label="Save Backup"><SaveIcon className="w-6 h-6"/></button>
                                <label className="p-2 rounded-full hover:bg-white/20 transition-colors cursor-pointer" aria-label="Load Backup">
                                    <UploadIcon className="w-6 h-6"/>
                                    <input type="file" accept=".json" onChange={handleLoadData} className="hidden"/>
                                </label>
                            </>
                        )}
                        {loggedInUser ? (
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold hidden sm:inline">خوش آمدید، {loggedInUser.name}</span>
                                <button onClick={handleLogout} className="p-2 rounded-full hover:bg-white/20 transition-colors" aria-label="Logout"><LogoutIcon className="w-6 h-6"/></button>
                            </div>
                        ) : (
                            <button onClick={() => setIsLoginModalOpen(true)} className="px-4 py-2 text-sm font-semibold bg-white text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors">ورود</button>
                        )}
                    </div>
                </div>
            </header>
        )}
        <main className={appScreen === AppScreen.Welcome ? '' : 'container mx-auto'}>
          {renderContent()}
        </main>
        <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
        <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} onLogin={handleLogin} loginError={loginError} />
    </div>
  );
};

export default App;