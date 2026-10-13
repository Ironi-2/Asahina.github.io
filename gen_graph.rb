require "json"
require "fileutils"
require "date"
require "time"
require "yaml"

posts_dir = "_posts"
baseurl = "/Asahina.github.io"
posts = []

Dir.glob(File.join(posts_dir, "*.md")).each do |file|
  content = File.read(file, encoding: "utf-8")
  if content =~ /^---\n(.*?)\n---/m
    # Ruby 3.1+ 的 Psych 默认禁止反序列化 Time/Date，需显式放行
    front_matter = YAML.safe_load($1, permitted_classes: [Time, Date, DateTime])
    next unless front_matter["layout"] == "post"

    # slug：剥掉文件名里的日期前缀；正则兼容月/日未补零的情况（如 2026-9-17-xxx）
    basename = File.basename(file, ".*")
    slug = front_matter["slug"] || basename.sub(/^\d{4}-\d{1,2}-\d{1,2}-/, "")

    # url：复刻 Jekyll date 风格 permalink（/:categories/:year/:month/:day/:title.html）
    date = front_matter["date"]
    date = DateTime.parse(date.to_s) unless date.respond_to?(:strftime)
    url = baseurl.dup
    categories = Array(front_matter["categories"])
    url << "/" << categories.join("/") unless categories.empty?
    url << date.strftime("/%Y/%m/%d/") << slug << ".html"

    posts << {
      slug: slug,
      title: front_matter["title"] || slug,
      tags: Array(front_matter["tags"]),
      categories: categories,
      date: front_matter["date"],
      excerpt: front_matter["excerpt"] || "",
      url: url
    }
  end
end

nodes = []
edges = []
tag_counts = Hash.new(0)
category_counts = Hash.new(0)

posts.each do |post|
  nodes << { id: "post:#{post[:slug]}", type: "post", label: post[:title], url: post[:url], tags: post[:tags], categories: post[:categories], date: post[:date] ? post[:date].strftime("%Y-%m-%d") : "", excerpt: post[:excerpt].to_s.strip[0,120], group: post[:categories].first || "uncategorized" }
  post[:tags].each do |tag|
    tag_counts[tag] += 1
    tag_id = "tag:#{tag}"
    unless nodes.any? { |n| n[:id] == tag_id }
      nodes << { id: tag_id, type: "tag", label: tag, count: 0, group: "tag" }
    end
    edges << { source: "post:#{post[:slug]}", target: tag_id, type: "tag" }
  end
  post[:categories].each do |cat|
    category_counts[cat] += 1
    cat_id = "category:#{cat}"
    unless nodes.any? { |n| n[:id] == cat_id }
      nodes << { id: cat_id, type: "category", label: cat, count: 0, group: "category" }
    end
    edges << { source: "post:#{post[:slug]}", target: cat_id, type: "category" }
  end
end

nodes.each do |node|
  if node[:type] == "tag"
    node[:count] = tag_counts[node[:label]]
  elsif node[:type] == "category"
    node[:count] = category_counts[node[:label]]
  end
end

post_nodes = nodes.select { |n| n[:type] == "post" }
post_nodes.combination(2).each do |a, b|
  shared_tags = a[:tags] & b[:tags]
  shared_cats = a[:categories] & b[:categories]
  weight = shared_tags.size + shared_cats.size * 0.5
  if weight > 0
    edges << { source: a[:id], target: b[:id], type: "similarity", weight: weight, shared_tags: shared_tags, shared_cats: shared_cats }
  end
end

posts.each do |post|
  file = Dir.glob(File.join(posts_dir, "*-#{post[:slug]}.md")).first
  next unless file
  content = File.read(file, encoding: "utf-8")
  # 取 front matter 之后的正文（注意：不要用 $POSTMATCH，未 require "English" 时它是 nil）
  fm = content.match(/---.*?---/m)
  next unless fm
  body = fm.post_match
  body.scan(/\[\[([^\]]+)\]\]/).each do |match|
    target_title = match[0].strip
    target_post = posts.find { |p| p[:title]&.strip == target_title || p[:slug] == target_title }
    if target_post
      edges << { source: "post:#{post[:slug]}", target: "post:#{target_post[:slug]}", type: "explicit" }
    end
  end
end

edges.uniq! { |e| [e[:source], e[:target], e[:type]].join("|") }

graph_data = {
  nodes: nodes,
  edges: edges,
  meta: {
    generated_at: Time.now.iso8601,
    post_count: posts.size,
    tag_count: tag_counts.size,
    category_count: category_counts.size
  }
}

FileUtils.mkdir_p("assets/data")
File.write("assets/data/graph.json", JSON.pretty_generate(graph_data))
puts "Generated: #{nodes.size} nodes, #{edges.size} edges"
