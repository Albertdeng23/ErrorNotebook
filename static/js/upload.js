// upload.js - 上传表单与富文本编辑器逻辑
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        tinymce.init({
            selector: '#reflection-editor',
            plugins: 'lists link image table code help wordcount',
            toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | link image | code',
            height: 300,
            menubar: false,
            placeholder: '在这里详细记录你的反思：是哪里看错了？哪个公式用混了？还是计算步骤跳步了？...'
        });

        const uploadSubTabs = document.querySelectorAll('.upload-sub-tabs .subject-btn');
        const uploadPanes = document.querySelectorAll('.upload-pane');
        const aiForm = document.getElementById('upload-form');
        const carelessForm = document.getElementById('careless-upload-form');

        uploadSubTabs.forEach(btn => {
            btn.addEventListener('click', () => {
                uploadSubTabs.forEach(b => b.classList.remove('active'));
                uploadPanes.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.subTab).classList.add('active');

                if (btn.dataset.subTab === 'ai-upload') {
                    if (carelessForm) { carelessForm.reset(); carelessForm.querySelector('#careless-image-preview').innerHTML = ''; carelessForm.querySelector('#careless-upload-status').innerHTML = ''; }
                } else {
                    if (aiForm) { aiForm.reset(); aiForm.querySelector('#image-preview').innerHTML = ''; aiForm.querySelector('#upload-status').innerHTML = ''; }
                }
            });
        });

        if (aiForm) {
            const aiImageInput = aiForm.querySelector('#question_image');
            const aiImagePreview = aiForm.querySelector('#image-preview');
            const aiSubmitBtn = aiForm.querySelector('#submit-btn');
            const aiUploadStatus = aiForm.querySelector('#upload-status');

            aiImageInput.addEventListener('change', function() {
                aiImagePreview.innerHTML = '';
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => { const img = document.createElement('img'); img.src = e.target.result; aiImagePreview.appendChild(img); };
                    reader.readAsDataURL(file);
                }
            });

            aiForm.addEventListener('submit', function(event) {
                event.preventDefault();
                aiSubmitBtn.disabled = true;
                aiSubmitBtn.textContent = '正在分析中...';
                aiUploadStatus.innerHTML = '';
                aiUploadStatus.className = '';
                fetch('/upload', { method: 'POST', body: new FormData(aiForm) })
                .then(response => { if (!response.ok) return response.json().then(err => { throw new Error(err.message) }); return response.json(); })
                .then(data => {
                    if (data.status === 'success') { aiUploadStatus.textContent = data.message + ' 页面即将刷新...'; aiUploadStatus.classList.add('success'); setTimeout(() => window.location.reload(), 2000); } else { throw new Error(data.message); }
                })
                .catch(error => {
                    aiUploadStatus.textContent = '上传失败：' + error.message;
                    aiUploadStatus.classList.add('error');
                    aiSubmitBtn.disabled = false;
                    aiSubmitBtn.textContent = '上传并分析';
                });
            });
        }

        if (carelessForm) {
            const carelessImageInput = carelessForm.querySelector('#careless_question_image');
            const carelessImagePreview = carelessForm.querySelector('#careless-image-preview');
            const carelessSubmitBtn = carelessForm.querySelector('#careless-submit-btn');
            const carelessUploadStatus = carelessForm.querySelector('#careless-upload-status');

            carelessImageInput.addEventListener('change', function() {
                carelessImagePreview.innerHTML = '';
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => { const img = document.createElement('img'); img.src = e.target.result; carelessImagePreview.appendChild(img); };
                    reader.readAsDataURL(file);
                }
            });

            carelessForm.addEventListener('submit', function(event) {
                event.preventDefault();
                const reflectionContent = tinymce.get('reflection-editor').getContent();
                if (!reflectionContent.trim()) { alert('请填写你的反思内容！'); return; }

                carelessSubmitBtn.disabled = true;
                carelessSubmitBtn.textContent = '正在保存...';
                carelessUploadStatus.innerHTML = '';
                carelessUploadStatus.className = '';

                const formData = new FormData(carelessForm);
                formData.append('user_reflection', reflectionContent);

                fetch('/upload-careless-mistake', { method: 'POST', body: formData })
                .then(response => { if (!response.ok) return response.json().then(err => { throw new Error(err.message) }); return response.json(); })
                .then(data => {
                    if (data.status === 'success') { carelessUploadStatus.textContent = data.message + ' 页面即将刷新...'; carelessUploadStatus.classList.add('success'); setTimeout(() => window.location.reload(), 2000); } else { throw new Error(data.message); }
                })
                .catch(error => {
                    carelessUploadStatus.textContent = '保存失败：' + error.message;
                    carelessUploadStatus.classList.add('error');
                    carelessSubmitBtn.disabled = false;
                    carelessSubmitBtn.textContent = '保存我的反思';
                });
            });
        }
    });
})();
