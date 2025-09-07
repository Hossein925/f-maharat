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
        const localData = await db.getLocalHospitals();
        setHospitals(localData);
        const remoteData = await db.syncHospitalsWithSupabase();
        setHospitals(remoteData);
        setIsLoading(false);
    };
    initializeData();

    const unsubscribe = db.onHospitalsChange((updatedHospitals) => {
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

  const withHospitalUpdate = (callback: (hospitals: Hospital[]) => Hospital[]) => {
    const updatedHospitals = callback([...hospitals]);
    const updatedHospital = updatedHospitals.find(h => h.id === selectedHospitalId);
    if (updatedHospital) {
        db.upsertHospital(updatedHospital);
    }
    setHospitals(updatedHospitals);
  };
  
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
    switch (currentView) {
      case View.StaffMemberView:
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
      case View.AccreditationManager:
      case View.NewsBannerManager:
      case View.HospitalCommunication:
      case View.AdminCommunication:
      case View.NeedsAssessmentManager:
        setSelectedDepartmentId(null);
        setCurrentView(View.DepartmentList);
        break;
      case View.DepartmentList:
        setSelectedHospitalId(null);
        if (loggedInUser?.role === UserRole.Admin) {
            setAppScreen(AppScreen.HospitalList);
        } else {
            handleLogout();
        }
        break;
    }
  };

  // --- Year Archiving ---
  const handleArchiveYear = (yearToArchive: number) => {
    withHospitalUpdate(currentHospitals => 
      currentHospitals.map(h => {
          if (h.id !== selectedHospitalId) return h;
          const hospital = JSON.parse(JSON.stringify(h));
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
      })
    );
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
          db.upsertHospital({ ...hospital, ...updatedData });
      }
  }

  const handleDeleteHospital = (id: string) => {
    db.deleteHospitalById(id);
    setHospitals(hospitals.filter(h => h.id !== id));
  };
  
  const createUpdater = (updateLogic: (h: Hospital) => Hospital) => {
    withHospitalUpdate(hs => hs.map(h => h.id === selectedHospitalId ? updateLogic(h) : h));
  };

  const handleAddDepartment = (name: string, managerName: string, managerNationalId: string, managerPassword: string, staffCount: number, bedCount: number) => {
    const newDepartment: Department = { id: Date.now().toString(), name, managerName, managerNationalId, managerPassword, staffCount, bedCount, staff: [] };
    createUpdater(h => ({ ...h, departments: [...h.departments, newDepartment] }));
  };

  const handleUpdateDepartment = (id: string, updatedData: Partial<Omit<Department, 'id' | 'staff'>>) => {
    createUpdater(h => ({ ...h, departments: h.departments.map(d => d.id === id ? { ...d, ...updatedData } : d)}));
  }

  const handleDeleteDepartment = (id: string) => {
    createUpdater(h => ({ ...h, departments: h.departments.filter(d => d.id !== id) }));
  };
  
  const handleAddStaff = (departmentId: string, name: string, title: string, nationalId: string, password?: string) => {
    const newStaff: StaffMember = { id: Date.now().toString(), name, title, nationalId, password, assessments: [] };
    createUpdater(h => ({ ...h, departments: h.departments.map(d => d.id === departmentId ? { ...d, staff: [...d.staff, newStaff] } : d)}));
  };

  const handleUpdateStaff = (departmentId: string, staffId: string, updatedData: Partial<Omit<StaffMember, 'id' | 'assessments'>>) => {
    createUpdater(h => ({ ...h, departments: h.departments.map(d => {
        if (d.id !== departmentId) return d;
        return { ...d, staff: d.staff.map(s => s.id === staffId ? { ...s, ...updatedData } : s)};
    })}));
  };

  const handleDeleteStaff = (departmentId: string, staffId: string) => {
      createUpdater(h => ({...h, departments: h.departments.map(d => 
        d.id === departmentId ? { ...d, staff: d.staff.filter(s => s.id !== staffId) } : d
      )}));
  };

   const handleAddOrUpdateAssessment = (departmentId: string, staffId: string, month: string, year: number, skills: SkillCategory[], template?: Partial<NamedChecklistTemplate>) => {
      createUpdater(h => ({...h, departments: h.departments.map(d => {
        if (d.id !== departmentId) return d;
        return {...d, staff: d.staff.map(s => {
          if (s.id !== staffId) return s;
          const existingAssessmentIndex = s.assessments.findIndex(a => a.month === month && a.year === year);
          const newAssessment: Assessment = {
            id: existingAssessmentIndex > -1 ? s.assessments[existingAssessmentIndex].id : Date.now().toString(),
            month, year, skillCategories: skills,
            supervisorMessage: existingAssessmentIndex > -1 ? s.assessments[existingAssessmentIndex].supervisorMessage : '',
            managerMessage: existingAssessmentIndex > -1 ? s.assessments[existingAssessmentIndex].managerMessage : '',
            templateId: template?.id, minScore: template?.minScore, maxScore: template?.maxScore,
            examSubmissions: existingAssessmentIndex > -1 ? s.assessments[existingAssessmentIndex].examSubmissions : [],
          };
          const updatedAssessments = [...s.assessments];
          if (existingAssessmentIndex > -1) {
            updatedAssessments[existingAssessmentIndex] = newAssessment;
          } else {
            updatedAssessments.push(newAssessment);
          }
          return { ...s, assessments: updatedAssessments };
        })}
      })}));
  };
  
  const handleUpdateAssessmentMessages = (departmentId: string, staffId: string, month: string, year: number, messages: { supervisorMessage: string; managerMessage: string; }) => {
    createUpdater(h => ({...h, departments: h.departments.map(d => {
      if (d.id !== departmentId) return d;
      return {...d, staff: d.staff.map(s => {
        if (s.id !== staffId) return s;
        return {...s, assessments: s.assessments.map(a => (a.month === month && a.year === year) ? {...a, ...messages} : a)}
      })}
    })}));
  };

  const handleSubmitExam = (departmentId: string, staffId: string, month: string, year: number, submission: ExamSubmission) => {
    createUpdater(h => ({...h, departments: h.departments.map(d => {
      if (d.id !== departmentId) return d;
      return {...d, staff: d.staff.map(s => {
        if (s.id !== staffId) return s;
        const assessmentIndex = s.assessments.findIndex(a => a.month === month && a.year === year);
        if (assessmentIndex === -1) {
            const newAssessment: Assessment = {
              id: Date.now().toString(), month, year, skillCategories: [], examSubmissions: [submission]
            };
            return { ...s, assessments: [...s.assessments, newAssessment] };
        }

        const updatedAssessments = [...s.assessments];
        const targetAssessment = { ...updatedAssessments[assessmentIndex] };
        targetAssessment.examSubmissions = targetAssessment.examSubmissions || [];
        const existingSubmissionIndex = targetAssessment.examSubmissions.findIndex(sub => sub.examTemplateId === submission.examTemplateId);
        if (existingSubmissionIndex > -1) {
          targetAssessment.examSubmissions[existingSubmissionIndex] = submission;
        } else {
          targetAssessment.examSubmissions.push(submission);
        }
        updatedAssessments[assessmentIndex] = targetAssessment;
        return { ...s, assessments: updatedAssessments };
      })}
    })}));
  };

  const handleAddOrUpdateWorkLog = (departmentId: string, staffId: string, workLog: MonthlyWorkLog) => {
    createUpdater(h => ({...h, departments: h.departments.map(d => {
      if (d.id !== departmentId) return d;
      return {...d, staff: d.staff.map(s => {
        if (s.id !== staffId) return s;
        const staffCopy = JSON.parse(JSON.stringify(s));
        if (!staffCopy.workLogs) staffCopy.workLogs = [];
        const logIndex = staffCopy.workLogs.findIndex((l: MonthlyWorkLog) => l.month === workLog.month && l.year === workLog.year);
        if (logIndex > -1) staffCopy.workLogs[logIndex] = workLog;
        else staffCopy.workLogs.push(workLog);
        return staffCopy;
      })}
    })}));
  };

  const handleComprehensiveImport = (departmentId: string, data: { [staffName: string]: Map<string, SkillCategory[]> }) => {
    createUpdater(h => {
        const hospital = JSON.parse(JSON.stringify(h));
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
    createUpdater(h => {
      const templates = h.checklistTemplates ? [...h.checklistTemplates] : [];
      const index = templates.findIndex(t => t.id === template.id);
      if (index > -1) templates[index] = template;
      else templates.push(template);
      return { ...h, checklistTemplates: templates };
    });
  };

  const handleDeleteChecklistTemplate = (templateId: string) => {
    createUpdater(h => ({...h, checklistTemplates: (h.checklistTemplates || []).filter(t => t.id !== templateId)}));
  };

  const handleAddOrUpdateExamTemplate = (template: ExamTemplate) => {
    createUpdater(h => {
      const templates = h.examTemplates ? [...h.examTemplates] : [];
      const index = templates.findIndex(t => t.id === template.id);
      if (index > -1) templates[index] = template;
      else templates.push(template);
      return { ...h, examTemplates: templates };
    });
  };

  const handleDeleteExamTemplate = (templateId: string) => {
    createUpdater(h => ({...h, examTemplates: (h.examTemplates || []).filter(t => t.id !== templateId)}));
  };

  const handleAddTrainingMaterial = (month: string, material: TrainingMaterial) => {
    createUpdater(h => {
      const hospitalCopy = JSON.parse(JSON.stringify(h));
      if (!hospitalCopy.trainingMaterials) hospitalCopy.trainingMaterials = [];
      let monthTraining = hospitalCopy.trainingMaterials.find((t: MonthlyTraining) => t.month === month);
      if (monthTraining) {
        monthTraining.materials.push(material);
      } else {
        hospitalCopy.trainingMaterials.push({ month, materials: [material] });
      }
      return hospitalCopy;
    });
  };

  const handleDeleteTrainingMaterial = (month: string, materialId: string) => {
    createUpdater(h => {
      if (!h.trainingMaterials) return h;
      return {...h, trainingMaterials: h.trainingMaterials.map(t => 
        t.month === month ? {...t, materials: t.materials.filter(m => m.id !== materialId)} : t
      )};
    });
  };

  const handleUpdateTrainingMaterialDescription = (month: string, materialId: string, description: string) => {
    createUpdater(h => {
      if (!h.trainingMaterials) return h;
      return {...h, trainingMaterials: h.trainingMaterials.map(t => 
        t.month === month ? {...t, materials: t.materials.map(m => m.id === materialId ? {...m, description} : m)} : t
      )};
    });
  };
  
  const handleAddAccreditationMaterial = (material: TrainingMaterial) => {
    createUpdater(h => ({...h, accreditationMaterials: [...(h.accreditationMaterials || []), material]}));
  };

  const handleDeleteAccreditationMaterial = (materialId: string) => {
    createUpdater(h => ({...h, accreditationMaterials: (h.accreditationMaterials || []).filter(m => m.id !== materialId)}));
  };

  const handleUpdateAccreditationMaterialDescription = (materialId: string, description: string) => {
    createUpdater(h => ({...h, accreditationMaterials: (h.accreditationMaterials || []).map(m => m.id === materialId ? {...m, description} : m)}));
  };
  
  const handleAddNewsBanner = async (banner: Omit<NewsBanner, 'id' | 'imageId'>, imageData: string) => {
    const imageId = await db.addMaterial({ id: Date.now().toString(), data: imageData, name: `banner_${banner.title.replace(/\s+/g, '_')}.jpg`, type: 'image/jpeg' });
    const newBanner: NewsBanner = { ...banner, id: Date.now().toString(), imageId };
    createUpdater(h => ({...h, newsBanners: [...(h.newsBanners || []), newBanner]}));
  };

  const handleUpdateNewsBanner = (bannerId: string, title: string, description: string) => {
    createUpdater(h => ({...h, newsBanners: (h.newsBanners || []).map(b => b.id === bannerId ? {...b, title, description} : b)}));
  };

  const handleDeleteNewsBanner = (bannerId: string) => {
    const banner = findHospital(selectedHospitalId)?.newsBanners?.find(b => b.id === bannerId);
    if (banner) db.deleteMaterial(banner.imageId);
    createUpdater(h => ({...h, newsBanners: (h.newsBanners || []).filter(b => b.id !== bannerId)}));
  };

  const handleAddPatient = (departmentId: string, name: string, nationalId: string, password?: string) => {
    const newPatient: Patient = { id: Date.now().toString(), name, nationalId, password, chatHistory: [] };
    createUpdater(h => ({...h, departments: h.departments.map(d => {
      if (d.id !== departmentId) return d;
      const patients = d.patients ? [...d.patients, newPatient] : [newPatient];
      return {...d, patients };
    })}));
  };

  const handleDeletePatient = (departmentId: string, patientId: string) => {
    createUpdater(h => ({...h, departments: h.departments.map(d => 
      d.id === departmentId ? {...d, patients: (d.patients || []).filter(p => p.id !== patientId)} : d
    )}));
  };

  const handleAddPatientEducationMaterial = (departmentId: string, material: TrainingMaterial) => {
    createUpdater(h => ({...h, departments: h.departments.map(d => {
      if (d.id !== departmentId) return d;
      const materials = d.patientEducationMaterials ? [...d.patientEducationMaterials, material] : [material];
      return {...d, patientEducationMaterials: materials };
    })}));
  };

  const handleDeletePatientEducationMaterial = (departmentId: string, materialId: string) => {
    createUpdater(h => ({...h, departments: h.departments.map(d => 
      d.id === departmentId ? {...d, patientEducationMaterials: (d.patientEducationMaterials || []).filter(m => m.id !== materialId)} : d
    )}));
  };

  const handleUpdatePatientEducationMaterialDescription = (departmentId: string, materialId: string, description: string) => {
    createUpdater(h => ({...h, departments: h.departments.map(d => 
      d.id === departmentId ? {...d, patientEducationMaterials: (d.patientEducationMaterials || []).map(m => m.id === materialId ? {...m, description} : m)} : d
    )}));
  };
  
  const handleSendMessageToPatient = (departmentId: string, patientId: string, content: MessageContent, sender: 'patient' | 'manager') => {
    createUpdater(h => {
        const hospital = JSON.parse(JSON.stringify(h));
        const department = hospital.departments.find((d: Department) => d.id === departmentId);
        if (!department?.patients) return hospital;
        const patient = department.patients.find((p: Patient) => p.id === patientId);
        if (!patient) return hospital;
        if (!patient.chatHistory) patient.chatHistory = [];
        patient.chatHistory.push({ id: Date.now().toString(), sender, timestamp: new Date().toISOString(), ...content });
        return hospital;
    });
  };

  const handleSendMessageToAdmin = (hospitalId: string, content: MessageContent, sender: 'hospital' | 'admin') => {
    const hospitalToUpdate = hospitals.find(h => h.id === hospitalId);
    if (!hospitalToUpdate) return;
    const hospitalCopy = JSON.parse(JSON.stringify(hospitalToUpdate));
    if (!hospitalCopy.adminMessages) hospitalCopy.adminMessages = [];
    hospitalCopy.adminMessages.push({ id: Date.now().toString(), sender, timestamp: new Date().toISOString(), ...content });
    db.upsertHospital(hospitalCopy);
    setHospitals(hospitals.map(h => h.id === hospitalId ? hospitalCopy : h));
  };
  
  const handleUpdateNeedsAssessmentTopics = (month: string, topics: NeedsAssessmentTopic[]) => {
    createUpdater(h => {
        const hospital = JSON.parse(JSON.stringify(h));
        if (!hospital.needsAssessments) hospital.needsAssessments = [];
        const assessmentIndex = hospital.needsAssessments.findIndex((na: MonthlyNeedsAssessment) => na.month === month && na.year === activeYear);
        if (assessmentIndex > -1) {
            hospital.needsAssessments[assessmentIndex].topics = topics;
        } else {
            hospital.needsAssessments.push({ month, year: activeYear, topics: topics });
        }
        return hospital;
    });
  };

  const handleSubmitNeedsAssessmentResponse = (departmentId: string, staffId: string, month: string, year: number, responses: Map<string, string>) => {
      createUpdater(h => {
          const hospital = JSON.parse(JSON.stringify(h));
          const monthlyAssessment = hospital.needsAssessments?.find((na: MonthlyNeedsAssessment) => na.month === month && na.year === year);
          const staffMember = hospital.departments.find((d: Department) => d.id === departmentId)?.staff.find((s: StaffMember) => s.id === staffId);
          if (!monthlyAssessment || !staffMember) return hospital;

          responses.forEach((response, topicId) => {
              const topic = monthlyAssessment.topics.find((t: NeedsAssessmentTopic) => t.id === topicId);
              if (topic) {
                  const responseIndex = topic.responses.findIndex(r => r.staffId === staffId);
                  const newResponse = { staffId, staffName: staffMember.name, response };
                  if (responseIndex > -1) topic.responses[responseIndex] = newResponse;
                  else topic.responses.push(newResponse);
              }
          });
          return hospital;
      });
  };

  const handleResetHospital = (supervisorNationalId: string, supervisorPassword: string) => {
      const hospital = findHospital(selectedHospitalId);
      if (hospital && hospital.supervisorNationalId === supervisorNationalId && hospital.supervisorPassword === supervisorPassword) {
          createUpdater(h => ({ ...h, departments: [] }));
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
              // Find patient record to pass to view
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
        return <div className="h-screen w-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900"><div className="text-center"><p className="text-xl font-semibold text-slate-700 dark:text-slate-300">در حال بارگذاری و همگام سازی اطلاعات...</p></div></div>;
    }

    if (appScreen === AppScreen.Welcome) {
      return <WelcomeScreen onEnter={() => setAppScreen(AppScreen.HospitalList)} />;
    }

    if (appScreen === AppScreen.HospitalList) {
      if (loggedInUser?.role !== UserRole.Admin) {
        return <WelcomeScreen onEnter={() => setIsLoginModalOpen(true)} />;
      }
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

    if (!selectedHospital && appScreen === AppScreen.MainApp && loggedInUser?.role !== UserRole.Patient) {
      return <div>Hospital not found.</div>;
    }
    
    // For patient portal, we need to find patient data differently
    if (currentView === View.PatientPortal && loggedInUser?.role === UserRole.Patient) {
        const patientHospital = findHospital(loggedInUser.hospitalId!);
        const patientDepartment = findDepartment(patientHospital, loggedInUser.departmentId!);
        // FIX: Look for patient in `patients` array instead of `staff` array.
        const patientSelf = patientDepartment?.patients?.find(p => p.id === loggedInUser.patientId!);
        
        if (patientDepartment && patientSelf) {
            return <PatientPortalView
                department={patientDepartment}
                patient={patientSelf}
                onSendMessage={(content) => handleSendMessageToPatient(patientDepartment.id, patientSelf.id, content, 'patient')}
            />
        }
    }


    if (!selectedHospital) return <div>Hospital not found error.</div>;

    switch (currentView) {
      case View.DepartmentList:
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
        return <ChecklistManager
          templates={selectedHospital.checklistTemplates || []}
          onAddOrUpdate={handleAddOrUpdateChecklistTemplate}
          onDelete={handleDeleteChecklistTemplate}
          onBack={handleBack}
        />
      case View.ExamManager:
        return <ExamManager
          templates={selectedHospital.examTemplates || []}
          onAddOrUpdate={handleAddOrUpdateExamTemplate}
          onDelete={handleDeleteExamTemplate}
          onBack={handleBack}
        />
      case View.TrainingManager:
        return <TrainingManager
          monthlyTrainings={selectedHospital.trainingMaterials || []}
          onAddMaterial={handleAddTrainingMaterial}
          onDeleteMaterial={handleDeleteTrainingMaterial}
          onUpdateMaterialDescription={handleUpdateTrainingMaterialDescription}
          onBack={handleBack}
        />
      case View.AccreditationManager:
        return <AccreditationManager
          materials={selectedHospital.accreditationMaterials || []}
          onAddMaterial={handleAddAccreditationMaterial}
          onDeleteMaterial={handleDeleteAccreditationMaterial}
          onUpdateMaterialDescription={handleUpdateAccreditationMaterialDescription}
          onBack={handleBack}
        />
      case View.NewsBannerManager:
        return <NewsBannerManager
          banners={selectedHospital.newsBanners || []}
          onAddBanner={handleAddNewsBanner}
          onUpdateBanner={handleUpdateNewsBanner}
          onDeleteBanner={handleDeleteNewsBanner}
          onBack={handleBack}
        />
      case View.PatientEducationManager:
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
        return <HospitalCommunicationView
          hospital={selectedHospital}
          onSendMessage={(content) => handleSendMessageToAdmin(selectedHospital.id, content, 'hospital')}
          onBack={handleBack}
        />
      case View.AdminCommunication:
        return <AdminCommunicationView
          hospitals={hospitals}
          onSendMessage={(hospitalId, content) => handleSendMessageToAdmin(hospitalId, content, 'admin')}
          onBack={handleBack}
        />
       case View.NeedsAssessmentManager:
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
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-sm">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  {(loggedInUser && appScreen === AppScreen.MainApp) && (
                      <button onClick={handleBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
                        <BackIcon className="w-6 h-6"/>
                      </button>
                  )}
                  <h1 className="text-xl font-bold">سامانه مهارت</h1>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={() => setIsAboutModalOpen(true)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" aria-label="About"><InfoIcon className="w-6 h-6"/></button>
                    {loggedInUser?.role === UserRole.Admin && (
                        <>
                            <button onClick={handleSaveData} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" aria-label="Save Backup"><SaveIcon className="w-6 h-6"/></button>
                            <label className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer" aria-label="Load Backup">
                                <UploadIcon className="w-6 h-6"/>
                                <input type="file" accept=".json" onChange={handleLoadData} className="hidden"/>
                            </label>
                        </>
                    )}
                    {loggedInUser ? (
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold hidden sm:inline">خوش آمدید، {loggedInUser.name}</span>
                            <button onClick={handleLogout} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" aria-label="Logout"><LogoutIcon className="w-6 h-6"/></button>
                        </div>
                    ) : (
                        <button onClick={() => setIsLoginModalOpen(true)} className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">ورود</button>
                    )}
                </div>
            </div>
        </header>
        <main className="container mx-auto">
          {renderContent()}
        </main>
        <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
        <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} onLogin={handleLogin} loginError={loginError} />
    </div>
  );
};

export default App;