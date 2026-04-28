import React, { useEffect } from 'react';
import Layout from '../components/Layout';

const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    document.title = "Privacy Policy | InterviewXpert";
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Privacy Policy</h1>
        <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 space-y-6">
          <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">1. Introduction</h3>
          <p>Welcome to InterviewXpert. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website and tell you about your privacy rights and how the law protects you.</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">2. Data We Collect</h3>
          <p>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together follows: Identity Data, Contact Data, Technical Data, and Usage Data.</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">3. How We Use Your Data</h3>
          <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data to provide the AI interview services, manage your account, and improve our platform.</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">4. Contact Us</h3>
          <p>If you have any questions about this privacy policy or our privacy practices, please contact us at support@interviewxpert.com.</p>
        </div>
      </div>
    </Layout>
  );
};

export default PrivacyPolicy;