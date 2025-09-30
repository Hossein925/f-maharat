import React from 'react';
import Modal from './Modal';
import { AparatIcon } from './icons/AparatIcon';
import { EmailIcon } from './icons/EmailIcon';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="درباره برنامه سامانه بیمارستان من">
      <div className="text-center space-y-6 text-slate-600 dark:text-slate-300">
        <div className="space-y-2">
          <p className="font-semibold text-lg">سازنده: حسین نصاری</p>
          <p>کارشناس پرستاری</p>
          <p>سوپروایزر آموزشی بیمارستان امام خمینی (ره) دهدشت</p>
        </div>
        
        <div className="space-y-2">
            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 pt-4 border-t border-slate-200 dark:border-slate-700">راه‌های ارتباطی</h4>
            <div className="flex justify-center items-center gap-6">
                <a href="https://www.aparat.com/Amazing.Nurse/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                    <AparatIcon className="w-6 h-6"/>
                    <span>کانال آپارات</span>
                </a>
                 <a href="mailto:ho3in.nasari@gmail.com" className="flex items-center gap-2 text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                    <EmailIcon className="w-6 h-6"/>
                    <span>ho3in.nasari@gmail.com</span>
                </a>
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default AboutModal;
