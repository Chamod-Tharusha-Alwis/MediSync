# Executive Summary & Abstract

## Abstract
MediSync is an enterprise-grade digital health and epidemiological surveillance platform designed for developing healthcare ecosystems, contextualized to the public and private health landscape of Sri Lanka. Addressing critical systemic bottlenecks—including physical outpatient department (OPD) congestion, manual paper-based prescription fraud, uncontrolled multi-pharmacy dispensing, unmonitored antibiotic stewardship, and fragmented, delayed infectious disease reporting—MediSync integrates a decentralized clinical workflow engine with real-time syndromic surveillance and machine learning-assisted clinical triage. 

The architecture encompasses a zero-trust multi-tenant MERN core (MongoDB, Express, React, Node.js) paired with an isolated Python/Flask machine learning service. Sensitive patient identifiers and health records are cryptographically protected via field-level AES-256-GCM authenticated encryption paired with blind indexing for privacy-preserving querying. Clinical safety gates enforce automatic drug-drug interaction detection, daily dosage ceiling verification, active allergy cross-checking, and cryptographic capability QR codes with constant-time patient National Identity Card (NIC) verification gates.

To assist clinicians under high OPD volume, MediSync incorporates a dual-tier symptom matching pipeline: Tier 1 executes an n-gram TF-IDF vectorizer coupled with cosine similarity scoring over 41 standardized clinical disease profiles, while Tier 2 provides sparse retrieval against a curated, quarantined knowledge base derived from CDC/SymCAT ambulatory survey data (174 auto-accepted condition profiles mapped to public-domain ICD-10-CM concepts). When Tier 1 top match confidence is $\ge 40.0\%$, Tier 1 takes absolute precedence; otherwise, the engine queries Tier 2. On the epidemiological surveillance front, MediSync runs automated spatio-temporal anomaly detection across Sri Lanka's 25 administrative districts, utilizing a 7-day observation window compared against a 56-day baseline, strictly gated by a 3-tier filter: case count floor ($N \ge 5$), 2 consecutive calendar days of elevation, and statistical standardized deviation ($z > 2.0$).

This technical report documents the complete architectural specification, security protocols, empirical ML evaluation, verification rigor (3,768 offline tests), deployment infrastructure, operational limitations, and academic viva defenses for the MediSync undergraduate software engineering capstone submission.

---

> [!IMPORTANT]
> **Regulatory and Clinical Disclaimer**:  
> MediSync is an academic university engineering prototype evaluated strictly on synthetic datasets and self-consistency protocols. All machine learning inference payloads and epidemiological anomaly signals carry the immutable system tag `clinicalValidation: not_established`. The system is not licensed, certified, or intended for autonomous medical diagnosis, clinical decision-making, or primary disease surveillance without human medical practitioner validation.
