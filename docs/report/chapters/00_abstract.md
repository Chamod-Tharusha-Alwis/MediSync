# Executive Summary & Abstract

## Abstract
MediSync is an enterprise-grade digital health and epidemiological surveillance platform designed for developing healthcare ecosystems, contextualized to the public and private health landscape of Sri Lanka. Addressing critical systemic bottlenecks—including physical outpatient department (OPD) congestion, manual paper-based prescription fraud, uncontrolled multi-pharmacy dispensing, unmonitored antibiotic stewardship, and fragmented, delayed infectious disease reporting—MediSync integrates a decentralized clinical workflow engine with real-time syndromic surveillance and machine learning-assisted clinical triage. 

The architecture encompasses a zero-trust multi-tenant MERN core (MongoDB, Express, React, Node.js) paired with an isolated Python/Flask machine learning service. Sensitive patient identifiers and health records are cryptographically protected via field-level AES-256-GCM authenticated encryption paired with blind indexing for privacy-preserving querying. Clinical safety gates enforce automatic drug-drug interaction detection, daily dosage ceiling verification, renal/hepatic contraindication checks, and cryptographic QR prescription dispensing validated against patient National Identity Card (NIC) verification tokens.

To assist clinicians under high OPD volume, MediSync incorporates a dual-tier symptom matching pipeline: Tier 1 executes a calibrated Random Forest classifier trained on 41 standardized clinical profiles, while Tier 2 provides sparse retrieval against a curated, quarantined knowledge base derived from CDC/SymCAT ambulatory survey data (174 auto-accepted condition profiles mapped to public-domain ICD-10-CM concepts). On the epidemiological surveillance front, MediSync runs automated spatio-temporal anomaly detection across Sri Lanka's 25 administrative districts, utilizing Exponentially Weighted Moving Averages (EWMA) and Cumulative Sum (C-SUM) algorithms across 12 tracked communicable diseases with automated threshold-gating to prevent alert fatigue.

This technical report documents the complete architectural specification, security protocols, empirical ML evaluation, verification rigor (3,465 offline tests across 207 suites), deployment infrastructure, operational limitations, and academic viva defenses for the MediSync undergraduate software engineering capstone submission.

---

> [!IMPORTANT]
> **Regulatory and Clinical Disclaimer**:  
> MediSync is an academic university engineering prototype evaluated strictly on synthetic datasets and self-consistency protocols. All machine learning inference payloads and epidemiological anomaly signals carry the immutable system tag `clinicalValidation: not_established`. The system is not licensed, certified, or intended for autonomous medical diagnosis, clinical decision-making, or primary disease surveillance without human medical practitioner validation.
