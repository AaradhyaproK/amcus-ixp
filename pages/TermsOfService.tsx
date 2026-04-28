import React, { useEffect } from 'react';
import Layout from '../components/Layout';

const TermsOfService: React.FC = () => {
  useEffect(() => {
    document.title = "Terms of Service | InterviewXpert";
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Terms of Service</h1>
        <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 space-y-6">
          <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">1. Acceptance of Terms</h3>
          <p>By accessing and using InterviewXpert, you accept and agree to be bound by the terms and provision of this agreement.</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">2. Use License</h3>
          <p>Permission is granted to temporarily download one copy of the materials (information or software) on InterviewXpert's website for personal, non-commercial transitory viewing only.</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">3. Disclaimer</h3>
          <p>The materials on InterviewXpert's website are provided on an 'as is' basis. InterviewXpert makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">4. Governing Law</h3>
          <p>These terms and conditions are governed by and construed in accordance with the laws and you irrevocably submit to the exclusive jurisdiction of the courts in that location.</p>
        </div>
      </div>
    </Layout>
  );
};

export default TermsOfService;