// client/src/components/Profile.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../apiConfig';

const Profile = ({ token }) => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  // ── Edit profile (bio / GitHub / LinkedIn) ─────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ bio: '', github: '', linkedin: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  // ── Add certificate ─────────────────────────────────────────────────────
  const [showAddCert, setShowAddCert] = useState(false);
  const [certForm, setCertForm] = useState({ title: '', issuer: '', url: '' });
  const [certFile, setCertFile] = useState(null);
  const [addingCert, setAddingCert] = useState(false);
  const [certError, setCertError] = useState(null);

  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/auth/profile/${userId}`, {
        headers: authHeaders(),
      });
      setProfile(res.data);
      setEditForm({
        bio: res.data.bio || '',
        github: res.data.github || '',
        linkedin: res.data.linkedin || '',
      });
      setError(null);
    } catch (err) {
      console.error('Profile fetch error:', err);
      setError('Profile not found');
    } finally {
      setLoading(false);
    }
  };

  const checkOwnProfile = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/auth/me`, {
        headers: authHeaders(),
      });
      setIsOwnProfile(res.data._id === userId);
    } catch (err) {
      console.error('Own profile check error:', err);
    }
  };

  // 👈 FIXED: useEffect is placed after fetchProfile/checkOwnProfile are
  // declared, so it no longer tries to access them before initialization
  // (that "Cannot access 'checkOwnProfile' before initialization" crash).
  useEffect(() => {
    fetchProfile();
    checkOwnProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  const saveProfileEdits = async () => {
    try {
      setSavingEdit(true);
      setEditError(null);
      const res = await axios.patch(
        `${API_BASE}/api/auth/update-profile`,
        editForm,
        { headers: authHeaders() }
      );
      setProfile((prev) => ({ ...prev, ...res.data.user }));
      setIsEditing(false);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const addCertificate = async () => {
    if (!certForm.title.trim()) {
      setCertError('Certificate title is required');
      return;
    }
    if (!certFile && !certForm.url.trim()) {
      setCertError('Add an image/PDF of the certificate, a verification link, or both');
      return;
    }

    try {
      setAddingCert(true);
      setCertError(null);

      const formData = new FormData();
      formData.append('title', certForm.title.trim());
      formData.append('issuer', certForm.issuer.trim());
      formData.append('url', certForm.url.trim());
      if (certFile) formData.append('image', certFile);

      const res = await axios.post(`${API_BASE}/api/auth/certificates`, formData, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
      });

      setProfile((prev) => ({ ...prev, certificates: res.data.certificates }));
      setCertForm({ title: '', issuer: '', url: '' });
      setCertFile(null);
      setShowAddCert(false);
    } catch (err) {
      setCertError(err.response?.data?.error || 'Failed to add certificate');
    } finally {
      setAddingCert(false);
    }
  };

  const deleteCertificate = async (certId) => {
    try {
      const res = await axios.delete(`${API_BASE}/api/auth/certificates/${certId}`, {
        headers: authHeaders(),
      });
      setProfile((prev) => ({ ...prev, certificates: res.data.certificates }));
    } catch (err) {
      console.error('Delete certificate error:', err);
    }
  };

  // 👈 LOADING SCREEN
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '6px solid rgba(255,255,255,0.3)',
          borderTop: '6px solid #00d4ff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  // 👈 ERROR SCREEN
  if (error || !profile) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)',
        color: 'white',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '28px', marginBottom: '16px' }}>👤 Profile Not Found</h2>
          <p style={{ opacity: 0.8, marginBottom: '32px' }}>{error || 'User does not exist'}</p>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
              color: 'white',
              padding: '16px 32px',
              border: 'none',
              borderRadius: '20px',
              fontSize: '18px',
              cursor: 'pointer'
            }}
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(20px)',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  const inputStyle = {
    width: '100%',
    padding: '14px 18px',
    borderRadius: '14px',
    border: '2px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.08)',
    color: 'white',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)',
      padding: '48px 24px',
      color: 'white'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '20px',
            cursor: 'pointer',
            marginBottom: '48px',
            fontWeight: '600'
          }}
        >
          ← Back to Dashboard
        </button>

        {/* Profile Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '32px',
          padding: '48px',
          ...cardStyle,
        }}>
          <div style={{ fontSize: '96px', marginBottom: '24px' }}>👤</div>
          <h1 style={{ fontSize: '40px', margin: '0 0 16px 0' }}>
            {profile.name || 'Unknown User'}
          </h1>
          <p style={{ color: '#00d4ff', fontSize: '20px', margin: '0 0 20px 0' }}>
            {profile.email || 'No email'}
          </p>

          {/* GitHub / LinkedIn links */}
          {(profile.github || profile.linkedin) && (
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
              {profile.github && (
                <a
                  href={profile.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: 'white', padding: '10px 20px', borderRadius: '20px',
                    textDecoration: 'none', fontWeight: 600, fontSize: '14px',
                  }}
                >
                  🐙 GitHub
                </a>
              )}
              {profile.linkedin && (
                <a
                  href={profile.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'rgba(10,102,194,0.25)',
                    border: '1px solid rgba(10,102,194,0.5)',
                    color: 'white', padding: '10px 20px', borderRadius: '20px',
                    textDecoration: 'none', fontWeight: 600, fontSize: '14px',
                  }}
                >
                  💼 LinkedIn
                </a>
              )}
            </div>
          )}

          {!isEditing && profile.bio && (
            <p style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: '18px',
              marginBottom: '8px',
              lineHeight: '1.6',
              fontStyle: 'italic'
            }}>
              "{profile.bio}"
            </p>
          )}

          {/* Edit form */}
          {isOwnProfile && isEditing && (
            <div style={{ textAlign: 'left', maxWidth: '480px', margin: '24px auto 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', opacity: 0.7, display: 'block', marginBottom: '6px' }}>Bio</label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={3}
                  placeholder="Tell people what you can teach and what you want to learn..."
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', opacity: 0.7, display: 'block', marginBottom: '6px' }}>🐙 GitHub URL</label>
                <input
                  value={editForm.github}
                  onChange={(e) => setEditForm((f) => ({ ...f, github: e.target.value }))}
                  placeholder="https://github.com/yourname"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', opacity: 0.7, display: 'block', marginBottom: '6px' }}>💼 LinkedIn URL</label>
                <input
                  value={editForm.linkedin}
                  onChange={(e) => setEditForm((f) => ({ ...f, linkedin: e.target.value }))}
                  placeholder="https://linkedin.com/in/yourname"
                  style={inputStyle}
                />
              </div>

              {editError && <div style={{ color: '#ef4444', fontSize: '14px' }}>❌ {editError}</div>}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={saveProfileEdits}
                  disabled={savingEdit}
                  style={{
                    flex: 1, background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                    color: 'white', padding: '14px', border: 'none', borderRadius: '14px',
                    fontWeight: 700, fontSize: '15px', cursor: savingEdit ? 'default' : 'pointer',
                    opacity: savingEdit ? 0.7 : 1,
                  }}
                >
                  {savingEdit ? 'Saving...' : '✅ Save'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditError(null);
                    setEditForm({
                      bio: profile.bio || '',
                      github: profile.github || '',
                      linkedin: profile.linkedin || '',
                    });
                  }}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.15)',
                    color: 'white', padding: '14px', border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '14px', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          marginBottom: '32px'
        }}>
          <div style={{
            background: 'rgba(16,185,129,0.2)',
            backdropFilter: 'blur(20px)',
            border: '2px solid #10b981',
            borderRadius: '20px',
            padding: '32px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', color: '#10b981' }}>🏆</div>
            <h3 style={{ color: '#fff', margin: '16px 0 12px 0', fontSize: '18px' }}>Total Swaps</h3>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
              {profile.totalSwaps || 0}
            </div>
          </div>

          <div style={{
            background: 'rgba(139,92,246,0.2)',
            backdropFilter: 'blur(20px)',
            border: '2px solid #8b5cf6',
            borderRadius: '20px',
            padding: '32px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', color: '#8b5cf6' }}>📚</div>
            <h3 style={{ color: '#fff', margin: '16px 0 12px 0', fontSize: '18px' }}>Skills Taught</h3>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>
              {profile.skillsTaught || 0}
            </div>
          </div>

          <div style={{
            background: 'rgba(59,130,246,0.2)',
            backdropFilter: 'blur(20px)',
            border: '2px solid #3b82f6',
            borderRadius: '20px',
            padding: '32px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', color: '#3b82f6' }}>🎯</div>
            <h3 style={{ color: '#fff', margin: '16px 0 12px 0', fontSize: '18px' }}>Skills Learned</h3>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>
              {profile.skillsLearned || 0}
            </div>
          </div>
        </div>

        {/* Certificates Section — proves the person actually has the skill */}
        <div style={{ ...cardStyle, padding: '32px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '24px' }}>🎓 Certificates & Proof of Skill</h2>
            {isOwnProfile && (
              <button
                onClick={() => { setShowAddCert((v) => !v); setCertError(null); }}
                style={{
                  background: showAddCert ? 'rgba(255,255,255,0.15)' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white', padding: '10px 20px', border: 'none', borderRadius: '16px',
                  fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                }}
              >
                {showAddCert ? '✕ Cancel' : '+ Add Certificate'}
              </button>
            )}
          </div>

          {isOwnProfile && showAddCert && (
            <div style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '16px', padding: '20px', marginBottom: '24px',
              display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <input
                value={certForm.title}
                onChange={(e) => setCertForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Certificate title (e.g. AWS Certified Developer)"
                style={inputStyle}
              />
              <input
                value={certForm.issuer}
                onChange={(e) => setCertForm((f) => ({ ...f, issuer: e.target.value }))}
                placeholder="Issued by (e.g. Amazon Web Services) — optional"
                style={inputStyle}
              />
              <input
                value={certForm.url}
                onChange={(e) => setCertForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="Verification link (e.g. credential URL) — optional if uploading an image"
                style={inputStyle}
              />
              <div>
                <label style={{ fontSize: '13px', opacity: 0.7, display: 'block', marginBottom: '6px' }}>
                  Or upload a photo/PDF of the certificate
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                  onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                  style={{ color: 'white' }}
                />
              </div>

              {certError && <div style={{ color: '#ef4444', fontSize: '14px' }}>❌ {certError}</div>}

              <button
                onClick={addCertificate}
                disabled={addingCert}
                style={{
                  background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                  color: 'white', padding: '14px', border: 'none', borderRadius: '14px',
                  fontWeight: 700, fontSize: '15px', cursor: addingCert ? 'default' : 'pointer',
                  opacity: addingCert ? 0.7 : 1,
                }}
              >
                {addingCert ? 'Uploading...' : '✅ Save Certificate'}
              </button>
            </div>
          )}

          {(!profile.certificates || profile.certificates.length === 0) ? (
            <p style={{ opacity: 0.6, fontSize: '15px' }}>
              {isOwnProfile
                ? 'No certificates yet — add one so people know you\'re actually skilled at what you teach.'
                : 'This user hasn\'t added any certificates yet.'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {profile.certificates.map((cert) => (
                <div
                  key={cert._id}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {cert.imageUrl && (
                    cert.imageUrl.toLowerCase().endsWith('.pdf') ? (
                      <a
                        href={`${API_BASE}${cert.imageUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '40px', textDecoration: 'none',
                        }}
                      >
                        📄
                      </a>
                    ) : (
                      <a href={`${API_BASE}${cert.imageUrl}`} target="_blank" rel="noopener noreferrer">
                        <img
                          src={`${API_BASE}${cert.imageUrl}`}
                          alt={cert.title}
                          style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
                        />
                      </a>
                    )
                  )}
                  <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{cert.title}</div>
                    {cert.issuer && <div style={{ fontSize: '13px', opacity: 0.7 }}>{cert.issuer}</div>}
                    {cert.url && (
                      <a
                        href={cert.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '13px', color: '#00d4ff', marginTop: '4px' }}
                      >
                        🔗 Verify credential
                      </a>
                    )}
                    {isOwnProfile && (
                      <button
                        onClick={() => deleteCertificate(cert._id)}
                        style={{
                          marginTop: '8px', background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px',
                          padding: '6px 10px', fontSize: '12px', cursor: 'pointer', alignSelf: 'flex-start',
                        }}
                      >
                        🗑 Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          {isOwnProfile && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                color: 'white',
                padding: '18px 36px',
                border: 'none',
                borderRadius: '25px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer',
                marginRight: '20px',
                boxShadow: '0 10px 30px rgba(0,212,255,0.4)'
              }}
            >
              ✏️ Edit Profile
            </button>
          )}
          {!isOwnProfile && (
            <button
              onClick={() => navigate(`/chatrooms`)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: 'white',
                padding: '18px 36px',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '25px',
                fontSize: '18px',
                cursor: 'pointer',
                boxShadow: '0 5px 20px rgba(0,0,0,0.2)'
              }}
            >
              💬 Send Message
            </button>
          )}
        </div>

        {/* Member Since */}
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: '24px',
          textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '16px',
            margin: 0,
            fontWeight: '500'
          }}>
            Member since {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Profile;
