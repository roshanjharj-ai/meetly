import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useDropzone } from 'react-dropzone';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css'; // Import crop styles

import { FiUser, FiMail, FiPhone, FiSun, FiMoon, FiArrowLeft, FiUploadCloud } from 'react-icons/fi';
import { UserContext } from '../context/UserContext';
import { updateUserProfile, type UserProfileUpdate } from '../services/api';

// --- Validation Schema ---
const profileSchema = z.object({
    full_name: z.string().min(2, { message: 'Full name must be at least 2 characters' }),
    user_name: z.string().min(3, { message: 'Username must be at least 3 characters' }).optional().or(z.literal('')),
    mobile: z.string().regex(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' }).optional().or(z.literal('')),
    picture: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const DefaultAvatar = () => (
    <svg className="w-100 h-100 text-secondary" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
    </svg>
);

const UserProfile = () => {
    const navigate = useNavigate();
    const { user, setUser, theme, toggleTheme } = useContext(UserContext);
    const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        // Set default values to prevent uncontrolled component warnings
        defaultValues: {
            full_name: '',
            user_name: '',
            mobile: '',
            picture: ''
        }
    });

    const [isLoading, setIsLoading] = useState(false);
    const [serverError, setServerError] = useState('');

    // State for image cropping
    const [imgSrc, setImgSrc] = useState('');
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<Crop>();
    const [showCropModal, setShowCropModal] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const pictureValue = watch('picture');

    // **FIX**: Use useEffect with 'reset' to populate the form when the user object is available
    useEffect(() => {
        if (user) {
            reset({
                full_name: user.full_name || '',
                user_name: user.user_name || '',
                mobile: user.mobile || '',
                picture: user.picture || '',
            });
        }
    }, [user, reset]); // This effect now runs only when the user object changes

    const onDrop = (acceptedFiles: File[]) => {
        if (acceptedFiles && acceptedFiles.length > 0) {
            const reader = new FileReader();
            reader.addEventListener('load', () => setImgSrc(reader.result?.toString() || ''));
            reader.readAsDataURL(acceptedFiles[0]);
            setShowCropModal(true);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpeg', '.png', '.gif', '.webp'] }
    });

    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        const newCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
            width, height
        );
        setCrop(newCrop);
    };

    const handleCropSave = () => {
        if (completedCrop && imgRef.current && canvasRef.current) {
            const image = imgRef.current;
            const canvas = canvasRef.current;
            const scaleX = image.naturalWidth / image.width;
            const scaleY = image.naturalHeight / image.height;
            const pixelRatio = window.devicePixelRatio;

            canvas.width = completedCrop.width * pixelRatio * scaleX;
            canvas.height = completedCrop.height * pixelRatio * scaleY;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(
                image,
                completedCrop.x * scaleX, completedCrop.y * scaleY,
                completedCrop.width * scaleX, completedCrop.height * scaleY,
                0, 0,
                completedCrop.width * scaleX, completedCrop.height * scaleY
            );

            const base64Image = canvas.toDataURL('image/jpeg', 0.9); // High quality JPEG
            setValue('picture', base64Image);
            setShowCropModal(false);
        }
    };

    const onSubmit = async (data: ProfileFormData) => {
        setIsLoading(true);
        setServerError('');
        try {
            // Ensure empty strings are not sent if fields are optional
            const updatePayload: UserProfileUpdate = {
                full_name: data.full_name,
                user_name: data.user_name || undefined,
                mobile: data.mobile || undefined,
                picture: data.picture || undefined,
            };

            const updatedUser = await updateUserProfile(updatePayload);
            if (setUser) setUser(prev => ({ ...prev, ...updatedUser }));

            alert('Profile updated successfully!');
            navigate('/');
        } catch (err: any) {
            setServerError(err.response?.data?.detail || 'Failed to update profile.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <style>{`
                .dropzone { border: 2px dashed #6c757d; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; transition: border-color 0.2s; }
                .dropzone:hover, .dropzone-active { border-color: #0d6efd; background-color: rgba(13, 110, 253, 0.05); }
                .cropper-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 1050; display: flex; align-items: center; justify-content: center; }
                .cropper-modal-content { background-color: #343a40; padding: 20px; border-radius: 12px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; }
                [data-bs-theme="light"] .cropper-modal-content { background-color: #fff; }
                .ReactCrop__image { max-height: 70vh; }
            `}</style>

            <div className="container-fluid d-flex justify-content-center align-items-center" style={{ minHeight: 'calc(100vh - 56px)', padding: '40px 15px' }}>
                <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="card card-body p-4 rounded-4 border-0 shadow-lg" style={{ minWidth: '320px', maxWidth: '500px', width: '90%' }}>
                    <div className="d-flex justify-content-between align-items-center mb-4">
                        <h4 className="mb-0 fw-bold">My Profile</h4>
                        <div className="d-flex align-items-center gap-3">
                            <button className="btn btn-sm btn-outline-secondary rounded-circle p-0 lh-1" style={{ width: '32px', height: '32px' }} onClick={toggleTheme}>{theme === 'dark' ? <FiSun size={16} /> : <FiMoon size={16} />}</button>
                            <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2" onClick={() => navigate(-1)}><FiArrowLeft /> Back</button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)}>
                        <div className="text-center mb-4">
                            <div className="position-relative mx-auto" style={{ width: '120px', height: '120px' }}>
                                {pictureValue ? (
                                    <img src={pictureValue} alt="Profile" className="rounded-circle w-100 h-100" style={{ objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${user?.full_name || user?.email}&background=random` }} />
                                ) : (
                                    <div className="rounded-circle bg-body-secondary w-100 h-100 d-flex align-items-center justify-content-center"><DefaultAvatar /></div>
                                )}
                            </div>
                        </div>
                        {serverError && <div className="alert alert-danger">{serverError}</div>}

                        <div {...getRootProps({ className: `dropzone mb-3 ${isDragActive ? 'dropzone-active' : ''}` })}>
                            <input {...getInputProps()} />
                            <div className="d-flex flex-column align-items-center justify-content-center">
                                <FiUploadCloud size={24} className="mb-2 text-secondary" />
                                <p className="mb-0 small">Drag & drop an image, or click to select</p>
                            </div>
                        </div>

                        <div className="form-floating mb-3">
                            <input type="text" id="full_name" placeholder="Full Name" className={`form-control ${errors.full_name ? 'is-invalid' : ''}`} {...register('full_name')} />
                            <label htmlFor="full_name"><FiUser className="me-2" /> Full Name</label>
                            {errors.full_name && <div className="invalid-feedback">{errors.full_name.message}</div>}
                        </div>
                        <div className="form-floating mb-3">
                            <input type="text" id="user_name" placeholder="User Name" className={`form-control ${errors.user_name ? 'is-invalid' : ''}`} {...register('user_name')} />
                            <label htmlFor="user_name"><FiUser className="me-2" /> User Name</label>
                            {errors.user_name && <div className="invalid-feedback">{errors.user_name.message}</div>}
                        </div>
                        <div className="form-floating mb-3">
                            <input type="email" id="email" placeholder="Email" className="form-control" value={user?.email || ''} readOnly disabled />
                            <label htmlFor="email"><FiMail className="me-2" /> Email</label>
                        </div>
                        <div className="form-floating mb-3">
                            <input type="tel" id="mobile" placeholder="Mobile Number" className={`form-control ${errors.mobile ? 'is-invalid' : ''}`} {...register('mobile')} />
                            <label htmlFor="mobile"><FiPhone className="me-2" /> Mobile Number</label>
                            {errors.mobile && <div className="invalid-feedback">{errors.mobile.message}</div>}
                        </div>

                        <div className="d-flex gap-2 mt-4">
                            <button type="button" className="btn btn-secondary w-50" onClick={() => navigate('/')}>Cancel</button>
                            <button type="submit" className="btn btn-primary w-50 fw-semibold" disabled={isLoading}>{isLoading ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    </form>
                </motion.div>
            </div>

            {showCropModal && (
                <div className="cropper-modal-backdrop">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="cropper-modal-content">
                        <h5 className="mb-3 text-center">Crop Your Image</h5>
                        {imgSrc && (
                            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={1}>
                                <img ref={imgRef} src={imgSrc} onLoad={onImageLoad} style={{ maxHeight: '70vh' }} alt="Crop preview" />
                            </ReactCrop>
                        )}
                        <div className="d-flex gap-2 mt-3">
                            <button className="btn btn-secondary w-50" onClick={() => setShowCropModal(false)}>Cancel</button>
                            <button className="btn btn-primary w-50" onClick={handleCropSave}>Save Image</button>
                        </div>
                    </motion.div>
                </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
    );
};

export default UserProfile;