
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
    <Modal isOpen={isOpen} onClose={onClose} title="درباره برنامه" maxWidthClass="max-w-2xl">
      <div className="space-y-4 text-slate-600 dark:text-slate-300 text-right leading-relaxed">
        <p>
          سامانه «مهارت» یک پلتفرم پیشرفته و یکپارچه برای مدیریت هوشمند عملکرد و توانمندسازی پرسنل مراکز درمانی است. این سامانه با هدف دیجیتالی کردن فرآیندهای ارزیابی، آموزش و بهبود مستمر طراحی شده تا به مدیران در تصمیم‌گیری‌های مبتنی بر داده و به پرسنل در مسیر رشد حرفه‌ای خود کمک کند.
        </p>
        <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100 pt-2">قابلیت‌های برجسته سامانه:</h4>
        <ul className="list-disc list-inside space-y-2 pr-4">
          <li><strong>مدیریت جامع:</strong> تعریف و مدیریت همزمان چندین بیمارستان، بخش و پرسنل با سطوح دسترسی مختلف (ادمین، سوپروایزر، مسئول بخش).</li>
          <li><strong>ارزیابی عملکرد:</strong> امکان بارگذاری چک‌لیست‌های عملکردی از طریق فایل اکسل یا ساخت قالب‌های سفارشی‌سازی‌شده درون برنامه برای ارزیابی دقیق مهارت‌ها.</li>
          <li><strong>آزمون‌های آنلاین:</strong> طراحی و برگزاری آزمون‌های تئوری (چهارگزینه‌ای و تشریحی) برای سنجش دانش پرسنل و مشاهده آنی نتایج.</li>
          <li><strong>مدیریت آموزش:</strong> بارگذاری و آرشیو محتواهای آموزشی (ویدئو، PDF، تصویر و...) به تفکیک ماه برای دسترسی آسان پرسنل.</li>
          <li><strong>تحلیل و گزارش‌دهی:</strong> مشاهده روند پیشرفت فردی و گروهی با نمودارهای تحلیلی و بصری.</li>
          <li><strong>برنامه بهبود هوشمند:</strong> ارائه خودکار برنامه مطالعاتی ۳۰ روزه بر اساس نقاط ضعف شناسایی‌شده در ارزیابی‌ها جهت توانمندسازی هدفمند.</li>
          <li><strong>ذخیره‌سازی و امنیت داده:</strong> قابلیت پشتیبان‌گیری و بازیابی اطلاعات در سطوح مختلف (بخش، بیمارستان یا کل داده‌ها) و عملکرد آفلاین برای دسترسی پایدار.</li>
        </ul>
        
        <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-700 text-center">
            <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-2">سخن پایانی</h4>
            <p className="italic">
                این برنامه برای استفاده عموم و کاملا رایگان طراحی شده امیدوارم در ارتقای دانش پرسنل و آموزش به بیمار مفید واقع گردد.
                <br />
                هزینه استفاده از برنامه ختم ده صلوات می باشد.
            </p>
            <p className="mt-4 text-slate-500 dark:text-slate-400" style={{ fontFamily: "'Scheherazade New', serif", fontSize: '1.2rem' }}>
                ستایش خداوندِ بخشنده را
                <br />
                که موجود کرد از عدم بنده را
            </p>
        </div>
        
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 space-y-3">
            <div className="flex items-center justify-center gap-4">
                <span>سازنده: حسین نصاری</span>
                <a href="mailto:ho3in.n12@gmail.com" className="text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors" aria-label="Email">
                    <EmailIcon className="w-6 h-6"/>
                </a>
            </div>
            <div className="text-center">
                <a href="https://www.aparat.com/Amazing.Nurse/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 hover:text-red-500 transition-colors">
                    <span>جهت مشاهده کلیپ های آموزشی وارد کانال آپارات شوید</span>
                    <AparatIcon className="w-8 h-8"/>
                </a>
            </div>
        </div>

      </div>
    </Modal>
  );
};

export default AboutModal;
