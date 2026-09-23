import React, { useState } from "react";
import { Send } from "lucide-react";
import { SOCIAL_LINKS } from "../lib/socialLinks";

interface ContactPageProps {
  displayToast: (msg: string) => void;
}

export default function ContactPage({ displayToast }: ContactPageProps) {
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMsg, setContactMsg] = useState("");

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    displayToast("📨 Thank you! Your feedback was received. We’ll respond within 24 hours.");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setContactMsg("");
  };

  return (
    <div className="container mx-auto px-4 md:px-8 pb-16 space-y-8 animate-fadeIn">
      <div className="text-center space-y-1.5 max-w-xl mx-auto py-6">
        <span className="text-xs font-bold text-[var(--pc-amber-400)] uppercase tracking-widest block">Get in Touch</span>
        <h1 className="font-playfair font-black text-3xl md:text-4xl text-[var(--pc-gray-700)]">Contact Pizza City Oman</h1>
        <p className="text-xs text-[var(--pc-gray-500)] leading-relaxed">
          Submit customer suggestions, menu feedbacks, bulk party bookings, or support questions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column blocks */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-2">
            <h4 className="font-bold text-xs text-[var(--pc-gray-500)] uppercase tracking-wider">Corporate Email</h4>
            <p className="font-bold text-sm text-[var(--pc-gray-700)]">info@pizzacityoman.com</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-2">
            <h4 className="font-bold text-xs text-[var(--pc-gray-500)] uppercase tracking-wider">Dial Helpline</h4>
            <p className="font-bold text-sm text-[var(--pc-gray-700)]">+968 9692 8714</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
            <h4 className="font-bold text-xs text-[var(--pc-gray-500)] uppercase tracking-wider">Follow Us on Social</h4>
            <div className="grid grid-cols-2 gap-2">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.id}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={social.label}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-[#D72B2B]/10 hover:bg-[var(--pc-red-500)]/5 hover:border-[var(--pc-red-500)]/30 transition-all group social-card"
                >
                  <span className="social-icon-circle w-9 h-9 rounded-full bg-[var(--pc-red-500)]/10 group-hover:bg-[var(--pc-red-500)] flex items-center justify-center transition-colors">
                    <img src={social.icon} alt={social.label} className="w-4.5 h-4.5 social-icon-img" />
                  </span>
                  <span className="text-[10px] font-bold text-[var(--pc-gray-600)]">{social.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column message form */}
        <form onSubmit={handleContactSubmit} className="lg:col-span-8 bg-white p-6 md:p-8 rounded-[28px] border border-gray-100 shadow-xs space-y-4">
          <h3 className="font-playfair font-black text-xl text-[var(--pc-gray-700)] mb-2">Send Us a Direct Message</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--pc-gray-600)] uppercase tracking-wider mb-1.5">Full Name</label>
              <input 
                type="text" 
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Salim Al-Maskari" 
                className="w-full bg-[var(--pc-gray-100)] border border-[#D72B2B]/10 rounded-xl px-4 py-3 text-xs text-[var(--pc-gray-600)] focus:border-[var(--pc-amber-400)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--pc-gray-600)] uppercase tracking-wider mb-1.5">Email (Optional)</label>
              <input 
                type="email" 
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="e.g. salim@example.com" 
                className="w-full bg-[var(--pc-gray-100)] border border-[#D72B2B]/10 rounded-xl px-4 py-3 text-xs text-[var(--pc-gray-600)] focus:border-[var(--pc-amber-400)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--pc-gray-600)] uppercase tracking-wider mb-1.5">WhatsApp Number (Optional)</label>
            <input 
              type="tel" 
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="e.g. +968 9XXX XXXX" 
              className="w-full bg-[var(--pc-gray-100)] border border-[#D72B2B]/10 rounded-xl px-4 py-3 text-xs text-[var(--pc-gray-600)] focus:border-[var(--pc-amber-400)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--pc-gray-600)] uppercase tracking-wider mb-1.5">Message / Customer Enquiry</label>
            <textarea 
              rows={4}
              required
              value={contactMsg}
              onChange={(e) => setContactMsg(e.target.value)}
              placeholder="Type what's on your mind..." 
              className="w-full bg-[var(--pc-gray-100)] border border-[#D72B2B]/10 rounded-xl px-4 py-3 text-xs text-[var(--pc-gray-600)] focus:border-[var(--pc-amber-400)] focus:outline-none"
            />
          </div>

          <button 
            type="submit"
            className="px-6 py-3.5 bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white font-bold rounded-full w-full text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#D72B2B]/10 active:scale-95 transition-all"
          >
            <Send size={14} />
            Transmit Message
          </button>
        </form>
      </div>
    </div>
  );
}
