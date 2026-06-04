const log = {
    pipeline: {
        step_5_tfidf_top_features: [['feature1', 0.5]]
    }
};
function escapeHtml(s) { return s; }

const html = `
                            ${(log.pipeline.step_5_tfidf_top_features || []).map(f => 
                                \`<span class="token highlight">\${escapeHtml(f[0])} <span style="opacity:0.6; font-size:0.8em">\${f[1]}</span></span>\`
                            ).join('') || '<span class="token">None</span>'}
`;
console.log(html);
